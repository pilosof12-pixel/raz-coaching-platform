// Minimal launch intake preflight.
// This does not make coaching decisions. It only rejects payloads that are too
// incomplete or malformed to justify an expensive program-generation call.

const LOCATIONS = new Set(["commercial_gym", "home_gym", "garage_gym", "outdoor_park", "calisthenics_park", "hotel_room", "travel", "home_bodyweight"]);
const LANGUAGES = new Set(["en", "he"]);

function nonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateLaunchIntake(intake) {
  if (!intake || typeof intake !== "object" || Array.isArray(intake)) return "Missing intake.";

  if (!Array.isArray(intake.primary_goals) || intake.primary_goals.length < 1) {
    return "Please list at least one primary goal.";
  }
  if (intake.primary_goals.length > 10 || intake.primary_goals.some((g) => !nonEmptyString(g))) {
    return "Primary goals must be a short list of specific goals.";
  }

  if (!nonEmptyString(intake.experience)) return "Please choose your experience level.";

  const days = Number(intake.days_per_week);
  if (!Number.isInteger(days) || days < 2 || days > 6) {
    return "Training days per week must be between 2 and 6.";
  }

  if (!nonEmptyString(intake.equipment)) return "Please tell us what equipment you have.";

  const location = String(intake.training_location || "").trim();
  if (!LOCATIONS.has(location)) return "Please choose a valid training location.";

  const language = String(intake.language || "en").trim().toLowerCase();
  if (!LANGUAGES.has(language)) return "Program language must be English or Hebrew.";

  if (intake.sport_schedule !== undefined && !Array.isArray(intake.sport_schedule)) {
    return "Sport schedule is malformed.";
  }
  if (Array.isArray(intake.sport_schedule) && intake.sport_schedule.length > 7) {
    return "Sport schedule cannot contain more than seven days.";
  }

  return null;
}
