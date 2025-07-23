export type IMethods = [
  "acl", "bind", "checkout", "connect", "copy", "delete", "get", "head", "link", "lock", "m-search", "merge",
  "mkactivity", "mkcalendar", "mkcol", "move", "notify", "options", "patch", "post", "propfind", "proppatch",
  "purge", "put", "query", "rebind", "report", "search", "source", "subscribe", "trace", "unbind", "unlink",
  "unlock", "unsubscribe"
]

export type IMethod = IMethods[number]

export type HttpMethods = {
  [key in IMethods[number]]: boolean;
}
