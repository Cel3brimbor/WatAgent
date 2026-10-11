//let the dialog paint, then run the grid mutation on the next macrotask
export function afterPaint(work: () => void): void {
  const macrotask = () => {
    setTimeout(work, 0);
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(macrotask);
  else macrotask();
}

//the switch spring is 200ms. calendar fill waits it out so the knob is not frozen mid-travel
export function afterMotion(work: () => void): void {
  setTimeout(work, 240);
}
