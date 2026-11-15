export const draftSavedEvent = "po:draft-saved";
export function markDraftSaved() {
  window.dispatchEvent(new Event(draftSavedEvent));
}
