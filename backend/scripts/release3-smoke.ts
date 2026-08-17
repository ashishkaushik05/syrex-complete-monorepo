const baseUrl = process.env.RELEASE3_SMOKE_BASE_URL ?? "http://127.0.0.1:3103/trpc";

type Session = {
  accessToken: string;
  user: { id: string; role: { name: string } };
};

async function call(
  procedure: string,
  input: Record<string, unknown> | undefined,
  token?: string,
  method: "GET" | "POST" = "POST",
) {
  const url = new URL(`${baseUrl}/${procedure}`);
  if (method === "GET" && input) {
    url.searchParams.set("input", JSON.stringify({ json: input }));
  }
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: method === "POST" ? JSON.stringify({ json: input ?? {} }) : undefined,
  });
  const body = await response.json() as any;
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message ?? `HTTP ${response.status}`) as Error & {
      status?: number;
    };
    error.status = response.status;
    throw error;
  }
  return body.result?.data?.json;
}

async function login(email: string, password: string): Promise<Session> {
  return call("auth.login", { email, password }) as Promise<Session>;
}

async function expectNotFound(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if ((error as { status?: number }).status === 404) return;
    throw error;
  }
  throw new Error("Expected foreign complaint access to return HTTP 404");
}

async function uploadEvidence(token: string, complaintId: string, suffix: string) {
  const bytes = new TextEncoder().encode(`release-3-evidence-${suffix}`);
  const pending = await call("attachments.createPending", {
    entityType: "service_complaint",
    entityId: complaintId,
    fileName: `evidence-${suffix}.jpg`,
    mimeType: "image/jpeg",
    fileSize: bytes.length,
    expiresInMinutes: 15,
  }, token);
  const upload = await fetch(pending.upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(bytes.length),
    },
    body: bytes,
  });
  if (!upload.ok) throw new Error(`Signed evidence upload failed: HTTP ${upload.status}`);
  await call("attachments.confirm", {
    attachmentId: pending.attachment.id,
  }, token);
  return pending.attachment.id as string;
}

async function submitDiagnostic(
  token: string,
  complaintId: string,
  templateId: string,
  suffix: string,
) {
  const attachmentId = await uploadEvidence(token, complaintId, suffix);
  await call("serviceForms.submitForm", {
    complaintId,
    templateId,
    values: [{ fieldKey: "voltage", rawValue: "12.6" }],
    attachmentIds: [attachmentId],
  }, token);
  await call("serviceTests.submit", {
    complaintId,
    verdict: "tested_ok",
    summary: `Tested OK (${suffix})`,
  }, token);
}

const nonce = Date.now().toString();
const admin = await login("admin@syrex.local", "admin123");
const candidates = await call("serviceAssignments.candidates", undefined, admin.accessToken, "GET");
const asiUser = candidates.asiUsers[0];
const engineer = candidates.serviceEngineers[0];
if (!asiUser || !engineer) throw new Error("Seeded ASI/SE candidates are missing");

const template = await call("serviceForms.createTemplate", {
  name: `Release 3 smoke ${nonce}`,
  fields: [{
    fieldKey: "voltage",
    label: "Battery voltage",
    fieldType: "number",
    isRequired: true,
    displayOrder: 1,
    validationRules: { min: 0, max: 100 },
  }],
}, admin.accessToken);

async function createComplaint(serial: string) {
  return call("serviceComplaints.create", {
    issueCategory: "Release 3 smoke",
    description: "Isolated mobile service smoke complaint",
    customerName: "Smoke Customer",
    customerPhone: "9999999999",
    complainantType: "self",
    sku: "SYR-INV-100",
    serialNumber: serial,
  }, admin.accessToken);
}

const complaint = await createComplaint(`R3-${nonce}`);
const unassigned = await createComplaint(`R3-FOREIGN-${nonce}`);
await call("serviceAssignments.assign", {
  complaintId: complaint.id,
  asiUserId: asiUser.id,
}, admin.accessToken);

const asi = await login("asi@syrex.local", "asi123");
const asiQueue = await call("serviceComplaints.list", { limit: 20 }, asi.accessToken, "GET");
if (!asiQueue.items.some((item: any) => item.id === complaint.id)) {
  throw new Error("ASI scoped queue did not include the assigned complaint");
}
await expectNotFound(() => call(
  "serviceComplaints.detail",
  { id: unassigned.id },
  asi.accessToken,
  "GET",
));
await call("serviceAssignments.reassign", {
  complaintId: complaint.id,
  seUserId: engineer.id,
}, asi.accessToken);

const se = await login("engineer1@syrex.local", "engineer1123");
const seQueue = await call("serviceComplaints.list", { limit: 20 }, se.accessToken, "GET");
if (!seQueue.items.some((item: any) => item.id === complaint.id)) {
  throw new Error("SE scoped queue did not include the assigned complaint");
}
await call("serviceComplaints.transition", {
  id: complaint.id,
  action: "visit_logged",
}, se.accessToken);
await submitDiagnostic(se.accessToken, complaint.id, template.id, "first");

await call("serviceTests.requestRetest", {
  complaintId: complaint.id,
  note: "Repeat diagnostic after load check",
}, asi.accessToken);
await call("serviceComplaints.transition", {
  id: complaint.id,
  action: "visit_logged",
}, se.accessToken);
await submitDiagnostic(se.accessToken, complaint.id, template.id, "retest");
await call("serviceComplaints.transition", {
  id: complaint.id,
  action: "tested_ok_close",
  note: "Release 3 smoke closed",
}, se.accessToken);

const closed = await call(
  "serviceComplaints.detail",
  { id: complaint.id },
  se.accessToken,
  "GET",
);
if (closed.status !== "resolved") throw new Error(`Expected resolved, got ${closed.status}`);

await call("auth.logout", undefined, asi.accessToken);
try {
  await call("serviceComplaints.list", { limit: 1 }, asi.accessToken, "GET");
  throw new Error("Revoked ASI token remained usable after logout");
} catch (error) {
  if ((error as { status?: number }).status !== 401) throw error;
}

console.log(JSON.stringify({
  ok: true,
  complaintId: complaint.id,
  templateId: template.id,
  asiUserId: asiUser.id,
  engineerUserId: engineer.id,
  retest: true,
  foreignDenied: true,
  logoutRevoked: true,
}));
