/** True when running in Node.js (where fetch(file://) is unavailable). */
export const isNode =
  typeof process !== "undefined" &&
  typeof process.versions?.node === "string";
