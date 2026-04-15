export function isPublicProfileMode() {
  return process.env.PUBLIC_PROFILE_ONLY === "1";
}
