//capture keeps a drag tracking outside its element. it throws when the pointer is no longer down,
//which must not abort the gesture that asked for it.
export function capturePointer(element: Element, pointerId: number): void {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    return;
  }
}
