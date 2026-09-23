/** Same admin check as the rest of the API surface (see app/api/admin/route.ts). */
export function checkAdmin(req: Request) {
  return req.headers.get('x-admin-secret') === process.env.ADMIN_SECRET;
}
