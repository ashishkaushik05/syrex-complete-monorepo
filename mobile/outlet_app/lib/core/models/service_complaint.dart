class ComplaintLineDto {
  final String id;
  final String? serialNumber;
  final String? productId;
  final String? notes;

  const ComplaintLineDto({
    required this.id,
    this.serialNumber,
    this.productId,
    this.notes,
  });

  factory ComplaintLineDto.fromJson(Map<String, dynamic> j) => ComplaintLineDto(
    id: j['id'] as String,
    serialNumber: j['serialNumber'] as String?,
    productId: j['productId'] as String?,
    notes: j['notes'] as String?,
  );
}

class ComplaintAssignment {
  final String? asiName;
  final String? seName;
  final String? createdAt;

  const ComplaintAssignment({this.asiName, this.seName, this.createdAt});

  factory ComplaintAssignment.fromJson(Map<String, dynamic> j) => ComplaintAssignment(
    asiName: j['asiUserName'] as String?,
    seName: j['seUserName'] as String?,
    createdAt: j['createdAt'] as String?,
  );
}

class ComplaintActivity {
  final String? actorName;
  final String action;
  final String? note;
  final String? createdAt;

  const ComplaintActivity({
    this.actorName,
    required this.action,
    this.note,
    this.createdAt,
  });

  factory ComplaintActivity.fromJson(Map<String, dynamic> j) => ComplaintActivity(
    actorName: (j['actor'] as Map<String, dynamic>?)?['name'] as String?,
    action: j['action'] as String,
    note: j['note'] as String?,
    createdAt: j['createdAt'] as String?,
  );
}

class ComplaintDto {
  final String id;
  final String complaintNumber;
  final String status;
  final String? title;
  final String? description;
  final String? customerName;
  final String? customerPhone;
  final String? resolutionNote;
  final String? resolvedAt;
  final String? createdAt;
  final String? assignedAsiName;
  final List<ComplaintLineDto> lines;
  final List<ComplaintAssignment> assignments;

  const ComplaintDto({
    required this.id,
    required this.complaintNumber,
    required this.status,
    this.title,
    this.description,
    this.customerName,
    this.customerPhone,
    this.resolutionNote,
    this.resolvedAt,
    this.createdAt,
    this.assignedAsiName,
    required this.lines,
    required this.assignments,
  });

  factory ComplaintDto.fromJson(Map<String, dynamic> j) {
    final assignments = (j['assignments'] as List<dynamic>? ?? [])
        .map((e) => ComplaintAssignment.fromJson(e as Map<String, dynamic>))
        .toList();

    // assignedAsiName: prefer top-level field (list + detail), fall back to assignments
    String? asiName = j['assignedAsiName'] as String?;
    if (asiName == null) {
      for (final a in assignments.reversed) {
        if (a.asiName != null) { asiName = a.asiName; break; }
      }
    }

    return ComplaintDto(
      id: j['id'] as String,
      complaintNumber: j['complaintNumber'] as String,
      status: j['status'] as String,
      title: j['title'] as String?,
      description: j['description'] as String?,
      customerName: j['customerName'] as String?,
      customerPhone: j['customerPhone'] as String?,
      resolutionNote: j['resolutionNote'] as String?,
      resolvedAt: j['resolvedAt'] as String?,
      createdAt: j['createdAt'] as String?,
      assignedAsiName: asiName,
      lines: (j['lines'] as List<dynamic>? ?? [])
          .map((e) => ComplaintLineDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      assignments: assignments,
    );
  }
}

class PagedComplaints {
  final List<ComplaintDto> items;
  final String? nextCursor;

  const PagedComplaints({required this.items, this.nextCursor});

  factory PagedComplaints.fromJson(Map<String, dynamic> j) => PagedComplaints(
    items: (j['items'] as List<dynamic>).map((e) => ComplaintDto.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: j['nextCursor'] as String?,
  );
}

class CreateComplaintLineInput {
  final String? serialNumber;
  final String? productId;
  final String? notes;

  const CreateComplaintLineInput({this.serialNumber, this.productId, this.notes});

  Map<String, dynamic> toJson() => {
    if (serialNumber != null) 'serialNumber': serialNumber,
    if (productId != null) 'productId': productId,
    if (notes != null) 'notes': notes,
  };
}

class CreateComplaintInput {
  final String? title;
  final String? description;
  final String? customerName;
  final String? customerPhone;
  final List<CreateComplaintLineInput> lines;

  const CreateComplaintInput({
    this.title,
    this.description,
    this.customerName,
    this.customerPhone,
    required this.lines,
  });

  Map<String, dynamic> toJson() => {
    if (title != null) 'title': title,
    if (description != null) 'description': description,
    if (customerName != null) 'customerName': customerName,
    if (customerPhone != null) 'customerPhone': customerPhone,
    'lines': lines.map((l) => l.toJson()).toList(),
  };
}
