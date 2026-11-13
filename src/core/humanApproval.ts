import { requireThat } from "./model";
export type HumanApprovalIntent = object & {
  readonly __humanApprovalIntent: unique symbol;
};
const intents = new WeakMap<object, number>();
export function humanApprovalIntent(event: Event): HumanApprovalIntent {
  requireThat(
    event instanceof Event &&
      event.isTrusted &&
      navigator.userActivation?.isActive,
    "HUMAN_APPROVAL_REQUIRED",
    "Approval requires an active trusted click or keyboard action in the human interface.",
  );
  Event.prototype.composedPath.call(event);
  const intent = Object.freeze({}) as HumanApprovalIntent;
  intents.set(intent, Date.now() + 10000);
  return intent;
}
export function consumeHumanApprovalIntent(intent: HumanApprovalIntent) {
  const expiry = intents.get(intent);
  intents.delete(intent);
  requireThat(
    expiry && Date.now() <= expiry,
    "HUMAN_APPROVAL_REQUIRED",
    "Approval requires a fresh human-interface action; agent tools cannot grant it.",
  );
}
