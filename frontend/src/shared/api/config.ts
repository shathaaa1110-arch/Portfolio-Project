// 1. Read the server URL from the environment variable
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

// 2. Read the mock flag and convert it to a boolean
const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK === "true";

// 3. If mock is off and the URL is empty -> throw a clear error
if (!USE_MOCK && !API_BASE_URL) {
  throw new Error(
    "EXPO_PUBLIC_API_URL is missing. Set it in frontend/.env.local, or set EXPO_PUBLIC_USE_MOCK=true."
  );
}

// 4. Export both values
export { API_BASE_URL, USE_MOCK };
