/**
 * Developer-only tools (handwriting tuner, device validation, timings).
 *
 * On in development builds. For a *release* validation build on a phone —
 * performance only means something in release — set VALIDATION_BUILD to
 * true, build, test, and set it back. Never ship it on: normal users must
 * not see these tools.
 */
const VALIDATION_BUILD = true;

export const VALIDATION_TOOLS = __DEV__ || VALIDATION_BUILD;

/**
 * True only in a release build made with VALIDATION_BUILD on: Home then
 * shows a "Validation build — not for release" badge, so such a build
 * cannot pass for a normal one. A test (validationGuard.test.js) fails
 * while VALIDATION_BUILD is true in the source.
 */
export const VALIDATION_RELEASE = !__DEV__ && VALIDATION_BUILD;

/**
 * Create My Handwriting (Lang4 onboarding). Shown in development and
 * validation builds only until the on-device image module exists — a
 * release build must not offer a step whose photos cannot be chosen.
 */
export const PERSONAL_HANDWRITING_ONBOARDING = VALIDATION_TOOLS;
