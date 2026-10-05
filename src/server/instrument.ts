// This fork never initializes a reporting SDK. Force the native helpers'
// documented opt-out before any device backend starts, regardless of host env.
process.env.MOBILE_DEV_TELEMETRY = "off";
for (const key of ["MOBILE_DEV_NATIVE_USER_ID", "MOBILE_DEV_NATIVE_SESSION_ID",
  "MOBILE_DEV_NATIVE_RELEASE", "MOBILE_DEV_NATIVE_ENVIRONMENT", "MOBILE_DEV_NATIVE_CACHE"]) {
  delete process.env[key];
}
