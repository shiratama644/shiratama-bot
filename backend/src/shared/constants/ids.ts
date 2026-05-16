// ── Modal IDs ────────────────────────────────────────────────────────────────
export const MODAL_GIVEAWAY_CREATE = 'giveaway:create';
export const MODAL_GIVEAWAY_SETTINGS = 'giveaway:settings';

// ── Giveaway-create modal field IDs ──────────────────────────────────────────
export const FIELD_CREATE_PRIZE = 'giveaway:create:prize';
export const FIELD_CREATE_AUTOREP = 'giveaway:create:autorep';
export const FIELD_CREATE_DURATION = 'giveaway:create:duration';
export const FIELD_CREATE_WINNERS = 'giveaway:create:winners';
export const FIELD_CREATE_DESCRIPTION = 'giveaway:create:description';

// Autorep select option values
export const VALUE_AUTOREP_DISABLE = 'disable';
export const VALUE_AUTOREP_ENABLE = 'enable';
export const VALUE_DEFAULT_WINNERS = '1';

// ── Giveaway-settings modal field IDs ────────────────────────────────────────
export const FIELD_SETTINGS_LANGUAGE = 'giveaway:settings:language';
export const FIELD_SETTINGS_WHO = 'giveaway:settings:who';
export const FIELD_SETTINGS_WHERE = 'giveaway:settings:where';
export const FIELD_SETTINGS_DEFCLAIM = 'giveaway:settings:defclaim';

// Language select option values
export const LANG_EN = 'en';
export const LANG_JA = 'ja';

// ── Button ID prefixes (appended with giveawayId) ────────────────────────────
export const BUTTON_TOGGLE_PREFIX = 'giveaway:toggle:';
export const BUTTON_COPY_PREFIX = 'giveaway:copy:';
export const BUTTON_CLAIM_PREFIX = 'giveaway:claim:';
export const BUTTON_LEAVE_PREFIX = 'giveaway:leave:';

// Button ID builder helpers
export const buttonToggleId = (giveawayId: string) => `${BUTTON_TOGGLE_PREFIX}${giveawayId}`;
export const buttonCopyId = (giveawayId: string) => `${BUTTON_COPY_PREFIX}${giveawayId}`;
export const buttonClaimId = (giveawayId: string) => `${BUTTON_CLAIM_PREFIX}${giveawayId}`;
export const buttonLeaveId = (giveawayId: string) => `${BUTTON_LEAVE_PREFIX}${giveawayId}`;

// ── Embed identifier text helpers ───────────────────────────────────────────────
export const EMBED_CLAIM_FOOTER_PREFIX = 'Claim • ';
export const embedClaimFooterText = (giveawayId: string) => `${EMBED_CLAIM_FOOTER_PREFIX}${giveawayId}`;
