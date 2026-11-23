/**
 * Map a GitHub failure to a translation key.
 *
 * The mapping lives outside the component so it can be tested without a
 * rendering environment.
 */

export function githubErrorKey(error) {
  switch (error?.status) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "notFound";
    case 409:
      return "conflict";
    default:
      break;
  }

  switch (error?.code) {
    case "missingRepo":
      return "missingRepo";
    case "missingToken":
      return "missingToken";
    case "invalidRepo":
      return "invalidRepo";
    case "invalidExport":
      return "invalidExport";
    case "versionMissing":
      return "notFound";
    case "offline":
      return "offline";
    default:
      return "unknown";
  }
}
