export async function downloadSignedFile(url: string, fileName: string) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${fileName} could not be downloaded.`)

  const objectUrl = URL.createObjectURL(await response.blob())
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
}
