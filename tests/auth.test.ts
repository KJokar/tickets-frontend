import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { AuthApiError, authenticatedFetch, canCreateTicket, getCountries, getCurrentUser, getRoles, homeForRole, login, logout, register, sessionExpiresAt, updateSessionProfile, type Registration } from "../src/lib/auth";
import { validateLogin, validateSignup } from "../src/lib/auth-validation";

afterEach(async () => { mock.restoreAll(); await logout(); });
const registration: Registration = {
  fullName: "نام مشتری", mobile: "+989121234567", countryId: 105, password: "Test-Password-123!",
  confirmPassword: "Test-Password-123!", role: "client",
};
const user = { id: 12, fullName: "نام مشتری", mobile: registration.mobile, countryId: 105, role: "Client", permissions: ["tickets.create", "tickets.read.own", "tickets.reply.own", "tickets.filter"] };
test("profile avatar updates persist without changing the session identity or access token", async () => {
  respond(envelope()); await login(registration.mobile, registration.password); mock.restoreAll();
  const avatarUrl = "/users/avatars/123.png";
  assert.equal(updateSessionProfile({ ...user, avatarUrl }).avatarUrl, avatarUrl);
  assert.equal((await getCurrentUser()).avatarUrl, avatarUrl);
  assert.throws(() => updateSessionProfile({ ...user, id: 13 }), AuthApiError);
  assert.equal((await getCurrentUser()).id, user.id);
  const fetch = respond({ data: [] }); await authenticatedFetch("/Tickets/v1/Profile");
  const [, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer backend.jwt.token");
  updateSessionProfile(user); assert.equal((await getCurrentUser()).avatarUrl, undefined);
});
function envelope(overrides: Record<string, unknown> = {}) {
  return { statusCode: 200, message: "Success", data: {
    user, token: "backend.jwt.token", expiresAt: new Date(Date.now() + 1_800_000).toISOString(),
    refreshToken: "backend.refresh.token", refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(), ...overrides,
  } };
}
function respond(body: unknown, status = 200) {
  return mock.method(globalThis, "fetch", async () => new Response(
    status === 204 ? null : JSON.stringify(body),
    { status, headers: { "Content-Type": "application/json" } },
  ));
}

test("countries load the backend list with stable IDs and dialing prefixes; failures never return a fake Iran-only list", async () => {
  const countries = [
    { id: 105, name: "Iran", isoCode: "IR", phoneCode: "+98", flag: "/flags/ir.svg" },
    { id: 82, name: "Germany", isoCode: "DE", phoneCode: "+49", flag: "/flags/de.svg" },
  ];
  const fetch = respond({ data: countries });
  assert.deepEqual(await getCountries(), countries);
  assert.equal(fetch.mock.calls[0].arguments[0], "/Common/v1/Countries/List");
  mock.restoreAll();
  for (const data of [[], null, [{ ...countries[0], phoneCode: "98" }], [{ ...countries[0], id: "105" }]]) {
    respond({ data });
    await assert.rejects(getCountries(), AuthApiError);
    mock.restoreAll();
  }
  respond({ data: null }, 503);
  await assert.rejects(getCountries(), (error: unknown) => error instanceof AuthApiError && error.status === 503);
});
test("login consumes ApiResultDto, numeric identity, and restores without /me", async () => {
  const fetch = respond(envelope());
  assert.deepEqual(await login(registration.mobile, registration.password), { ...user, role: "client" });
  const [url, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(url, "/api/v1/auth/login");
  assert.equal(init.method, "POST");
  assert.equal(init.credentials, "omit");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(JSON.parse(init.body as string), { mobile: registration.mobile, countryId: 105, password: registration.password });
  assert.equal((await getCurrentUser()).id, 12);
  assert.ok(sessionExpiresAt() > Date.now());
  assert.equal(fetch.mock.callCount(), 1);
});
test("signup authenticates both roles using its returned tokens without a second login request", async () => {
  for (const role of ["client", "agent"] as const) {
    const fetch = respond(envelope({ user: { ...user, role: role === "agent" ? "Agent" : "Client" } }), 201);
    const currentUser = await register({ ...registration, role });
    assert.equal(currentUser.role, role);
    assert.equal(homeForRole(currentUser.role), role === "agent" ? "/support/dashboard" : "/client/dashboard");
    assert.deepEqual(await getCurrentUser(), currentUser);
    const [url, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "/api/v1/auth/register");
    assert.deepEqual(JSON.parse(init.body as string), { ...registration, role: role === "agent" ? "Agent" : "Client" });
    assert.equal(fetch.mock.callCount(), 1);
    mock.restoreAll();
  }
});

test("registration stores a restorable session without passwords or a persistent login", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    respond(envelope(), 201);
    await register(registration);
    assert.equal(temporary.size, 1);
    assert.equal(persistent.size, 0);
    const saved = [...temporary.values()][0];
    assert.equal(saved.includes(registration.password), false);
    assert.equal(JSON.parse(saved).token, "backend.jwt.token");
    assert.equal((await getCurrentUser()).id, user.id);
    mock.restoreAll();
    const fetch = respond({ data: [] });
    await authenticatedFetch("/Tickets/v1/Tickets/List");
    const [, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer backend.jwt.token");
  });
});

test("logout cancels an unfinished registration so a late response cannot authenticate", async () => {
  let complete!: (response: Response) => void;
  mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => { complete = resolve; }));
  const pending = register(registration);
  await logout();
  complete(Response.json(envelope(), { status: 201 }));
  await assert.rejects(pending, AuthApiError);
  await assert.rejects(getCurrentUser, AuthApiError);
});
test("unknown roles, invalid identity, absent tokens and expired sessions never authenticate", async () => {
  for (const overrides of [
    { user: { ...user, role: "Admin" } }, { user: { ...user, role: undefined } },
    { user: { ...user, id: "12" } }, { user: { ...user, id: 0 } },
    { token: "" }, { expiresAt: "invalid" }, { expiresAt: new Date(0).toISOString() },
  ]) {
    respond(envelope(overrides));
    await assert.rejects(login(registration.mobile, registration.password), (e: unknown) => e instanceof AuthApiError && e.status === 502);
    await assert.rejects(register(registration), (e: unknown) => e instanceof AuthApiError && e.status === 502);
    mock.restoreAll();
  }
});
test("malformed and empty responses do not complete signup or login", async () => {
  for (const body of ["<html>fallback</html>", "null", "{}", "[]"]) {
    mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(register(registration), AuthApiError);
    await assert.rejects(login(registration.mobile, registration.password), AuthApiError);
    mock.restoreAll();
  }
  respond(null, 204);
  await assert.rejects(login(registration.mobile, registration.password), AuthApiError);
});
test("incorrect credentials, duplicates and rate limits display Persian messages", async () => {
  for (const [status, expected] of [[401, "شماره موبایل یا رمز عبور صحیح نیست."], [409, "این شماره موبایل قبلاً ثبت شده است."], [429, "تعداد درخواست‌ها بیش از حد مجاز است. کمی بعد دوباره تلاش کنید."]] as const) {
    respond({ message: "English backend error", data: null, statusCode: status }, status);
    await assert.rejects(login(registration.mobile, registration.password), (e: unknown) => {
      assert.ok(e instanceof AuthApiError);
      assert.equal(e.status, status);
      assert.equal(e.message, expected);
      if (status === 409) assert.equal(e.fieldErrors.mobile, expected);
      return true;
    });
    mock.restoreAll();
  }
});
test("field errors accept PascalCase ASP.NET fields and preserve Persian text", async () => {
  respond({ message: "اعتبارسنجی ناموفق بود.", errors: { Mobile: ["شماره موبایل تکراری است."], Password: "Password policy rejected" } }, 400);
  await assert.rejects(register(registration), (e: unknown) => {
    assert.ok(e instanceof AuthApiError);
    assert.equal(e.fieldErrors.mobile, "شماره موبایل تکراری است.");
    assert.equal(e.fieldErrors.password, "رمز عبور با شرایط سرویس مطابقت ندارد.");
    return true;
  });
});
test("network errors do not expose raw exception details", async () => {
  mock.method(globalThis, "fetch", async () => { throw new TypeError("private transport detail"); });
  await assert.rejects(login(registration.mobile, registration.password), (e: unknown) => e instanceof AuthApiError && e.status === 0 && !e.message.includes("private"));
});
test("protected requests attach JWT and never leak it to arbitrary URLs", async () => {
  respond(envelope());
  await login(registration.mobile, registration.password);
  mock.restoreAll();
  const fetch = respond({ data: [] });
  await authenticatedFetch("/Tickets/v1/Tickets/List", { headers: { "X-Test": "yes" } });
  const [, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
  assert.equal(new Headers(init.headers).get("Authorization"), "Bearer backend.jwt.token");
  assert.equal(new Headers(init.headers).get("X-Test"), "yes");
  assert.equal(init.cache, "no-store");
  for (const url of ["https://example.com", "//example.com", "/Tickets/v1/../../evil", "/Tickets/v1/\\evil"]) {
    await assert.rejects(authenticatedFetch(url), AuthApiError);
  }
  assert.equal(fetch.mock.callCount(), 1);
});
test("protected 401 clears session, while 403 preserves it", async () => {
  respond(envelope());
  await login(registration.mobile, registration.password);
  mock.restoreAll();
  respond({}, 403);
  assert.equal((await authenticatedFetch("/Tickets/v1/Tickets/Unassigned")).status, 403);
  assert.equal((await getCurrentUser()).id, 12);
  mock.restoreAll();
  respond({}, 401);
  await assert.rejects(authenticatedFetch("/Tickets/v1/Tickets/List"), AuthApiError);
  await assert.rejects(getCurrentUser, AuthApiError);
});
test("logout clears session locally without calling nonexistent endpoints", async () => {
  const fetch = respond(envelope());
  await login(registration.mobile, registration.password);
  await logout();
  await logout();
  await assert.rejects(getCurrentUser, AuthApiError);
  assert.equal(fetch.mock.callCount(), 1);
});
test("signup mirrors the relaxed backend password policy, lengths, role and confirmation", () => {
  assert.deepEqual(validateSignup(registration), {});
  assert.deepEqual(validateSignup({ ...registration, password: "Aa!۱۲۳۴۵۶۷۸۹", confirmPassword: "Aa!۱۲۳۴۵۶۷۸۹" }), {});
  assert.deepEqual(validateSignup({ ...registration, password: "1234", confirmPassword: "1234" }), {});
  for (const password of ["", "a".repeat(129)]) assert.ok(validateSignup({ ...registration, password, confirmPassword: password }).password);
  for (const fullName of [" ", " آ ", "a".repeat(151)]) assert.ok(validateSignup({ ...registration, fullName }).fullName);
  assert.ok(validateSignup({ ...registration, mobile: "broken" }).mobile);
  assert.ok(validateSignup({ ...registration, role: "admin" }).role);
  assert.ok(validateSignup({ ...registration, confirmPassword: "different" }).confirmPassword);
});
test("login skips signup complexity rules; roles select separate dashboards", () => {
  assert.deepEqual(validateLogin(registration.mobile, "x"), {});
  assert.ok(validateLogin("broken-address", "password").mobile);
  assert.deepEqual(Object.keys(validateLogin(" ", "")).sort(), ["mobile", "password"]);
  assert.equal(homeForRole("client"), "/client/dashboard");
  assert.equal(homeForRole("agent"), "/support/dashboard");
});

test("sessions expire after login and malformed persisted storage fails closed", async () => {
  const stored = new Map<string, string>();
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    },
  } });
  try {
    respond(envelope());
    await login(registration.mobile, registration.password);
    assert.ok(stored.has("ticketino.auth.v1"));
    stored.set("ticketino.auth.v1", "invalid-json");
    await assert.rejects(getCurrentUser, AuthApiError);
    assert.equal(stored.size, 0);
    await login(registration.mobile, registration.password);
    const expiry = sessionExpiresAt();
    mock.method(Date, "now", () => expiry + 100 * 86_400_000);
    await assert.rejects(getCurrentUser, AuthApiError);
    assert.equal(stored.size, 0);
  } finally {
    Reflect.deleteProperty(globalThis, "window");
  }
});

async function withBrowserStorage(run: (temporary: Map<string, string>, persistent: Map<string, string>) => Promise<void>) {
  const temporary = new Map<string, string>();
  const persistent = new Map<string, string>();
  const storage = (values: Map<string, string>) => ({
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    sessionStorage: storage(temporary), localStorage: storage(persistent), dispatchEvent: () => true,
  } });
  try { await run(temporary, persistent); }
  finally { await logout(); Reflect.deleteProperty(globalThis, "window"); }
}

test("remember me selects persistent storage without sending extra backend fields or saving passwords", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    const fetch = respond(envelope());
    await login(registration.mobile, registration.password, true);
    assert.equal(temporary.size, 0);
    assert.equal(persistent.size, 1);
    const saved = [...persistent.values()][0];
    assert.equal(saved.includes(registration.password), false);
    assert.deepEqual(JSON.parse(saved).user, { ...user, role: "client" });
    const [, init] = fetch.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.deepEqual(JSON.parse(init.body as string), { mobile: registration.mobile, countryId: 105, password: registration.password });
    assert.equal((await getCurrentUser()).id, user.id);
    await logout();
    assert.equal(temporary.size, 0);
    assert.equal(persistent.size, 0);
  });
});

test("normal login removes any previously remembered session and uses only tab storage", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    respond(envelope());
    await login(registration.mobile, registration.password, true);
    assert.equal(persistent.size, 1);
    await login(registration.mobile, registration.password);
    assert.equal(temporary.size, 1);
    assert.equal(persistent.size, 0);
    temporary.clear();
    await assert.rejects(getCurrentUser, AuthApiError);
  });
});

test("remembered sessions expire and removal in another tab cannot restore an in-memory user", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    respond(envelope());
    await login(registration.mobile, registration.password, true);
    persistent.clear();
    await assert.rejects(getCurrentUser, AuthApiError);
    await login(registration.mobile, registration.password, true);
    const expiry = sessionExpiresAt();
    mock.method(Date, "now", () => expiry + 100 * 86_400_000);
    await assert.rejects(getCurrentUser, AuthApiError);
    assert.equal(temporary.size, 0);
    assert.equal(persistent.size, 0);
  });
});

test("role options come from the API, including enum values and Persian labels", async () => {
  const fetch = respond({ data: [{ id: 1, value: "Client", label: "کاربر عادی" }, { id: 2, value: "Agent", label: "پشتیبان" }] });
  assert.deepEqual(await getRoles(), [{ id: 1, value: "client", label: "کاربر عادی" }, { id: 2, value: "agent", label: "پشتیبان" }]);
  assert.equal(fetch.mock.calls[0].arguments[0], "/api/v1/auth/roles");
});

test("concurrent 401 requests rotate the refresh token once and retry with the new access token", async () => {
  await withBrowserStorage(async (_temporary, persistent) => {
    respond(envelope());
    await login(registration.mobile, registration.password, true);
    mock.restoreAll();
    let refreshes = 0, attempts = 0;
    mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
      if (path === "/api/v1/auth/refresh") {
        refreshes++;
        assert.deepEqual(JSON.parse(init.body as string), { refreshToken: "backend.refresh.token" });
        await new Promise(resolve => setTimeout(resolve, 10));
        return Response.json(envelope({ token: "new-access", refreshToken: "new-refresh" }));
      }
      attempts++;
      return Response.json({}, { status: new Headers(init.headers).get("Authorization") === "Bearer new-access" ? 200 : 401 });
    });
    const responses = await Promise.all([authenticatedFetch("/Tickets/v1/Tickets/List"), authenticatedFetch("/Tickets/v1/Tickets/Dashboard")]);
    assert.ok(responses.every(response => response.status === 200));
    assert.equal(refreshes, 1);
    assert.equal(attempts, 4);
    assert.equal(JSON.parse([...persistent.values()][0]).refreshToken, "new-refresh");
  });
});

test("expired access tokens restore through refresh, preserving temporary storage", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    respond(envelope());
    await login(registration.mobile, registration.password);
    const key = [...temporary.keys()][0];
    const stored = JSON.parse(temporary.get(key)!);
    stored.expiresAt = new Date(Date.now() - 1000).toISOString();
    temporary.set(key, JSON.stringify(stored));
    mock.restoreAll();
    const fetch = respond(envelope({ token: "restored-access", refreshToken: "rotated-refresh" }));
    assert.equal((await getCurrentUser()).id, user.id);
    assert.equal(fetch.mock.calls[0].arguments[0], "/api/v1/auth/refresh");
    assert.equal(persistent.size, 0);
    assert.equal(JSON.parse(temporary.get(key)!).token, "restored-access");
  });
});

test("a second protected 401 ends the session without entering a refresh loop", async () => {
  respond(envelope()); await login(registration.mobile, registration.password); mock.restoreAll();
  let refreshes = 0, attempts = 0;
  mock.method(globalThis, "fetch", async (path: string) => {
    if (path === "/api/v1/auth/refresh") { refreshes++; return Response.json(envelope({ token: "new-token" })); }
    attempts++; return Response.json({}, { status: 401 });
  });
  await assert.rejects(authenticatedFetch("/Tickets/v1/Tickets/List"), (error: unknown) => error instanceof AuthApiError && error.status === 401);
  assert.equal(refreshes, 1); assert.equal(attempts, 2);
  await assert.rejects(getCurrentUser, AuthApiError);
});

test("refresh outages preserve credentials so recovery is retryable", async () => {
  await withBrowserStorage(async (temporary) => {
    respond(envelope()); await login(registration.mobile, registration.password);
    const key = [...temporary.keys()][0], stored = JSON.parse(temporary.get(key)!);
    stored.expiresAt = new Date(0).toISOString(); temporary.set(key, JSON.stringify(stored)); mock.restoreAll();
    respond({}, 503);
    await assert.rejects(getCurrentUser, (error: unknown) => error instanceof AuthApiError && error.status === 503);
    assert.equal(temporary.size, 1);
    mock.restoreAll(); respond(envelope({ token: "recovered-access" }));
    assert.equal((await getCurrentUser()).id, user.id);
  });
});

test("logout prevents a late refresh response from restoring the session", async () => {
  await withBrowserStorage(async (temporary, persistent) => {
    respond(envelope()); await login(registration.mobile, registration.password);
    const key = [...temporary.keys()][0], stored = JSON.parse(temporary.get(key)!);
    stored.expiresAt = new Date(0).toISOString(); temporary.set(key, JSON.stringify(stored)); mock.restoreAll();
    let complete!: (response: Response) => void;
    mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => { complete = resolve; }));
    const pending = getCurrentUser();
    await logout(); complete(Response.json(envelope({ token: "late-access" })));
    await assert.rejects(pending, AuthApiError);
    assert.equal(temporary.size, 0); assert.equal(persistent.size, 0);
  });
});

test("protected POST retries after refresh with the same body and the rotated Bearer token", async () => {
  respond(envelope()); await login(registration.mobile, registration.password); mock.restoreAll();
  const bodies: string[] = [], tokens: string[] = [];
  mock.method(globalThis, "fetch", async (path: string, init: RequestInit) => {
    if (path === "/api/v1/auth/refresh") return Response.json(envelope({ token: "new-access" }));
    bodies.push(init.body as string); tokens.push(new Headers(init.headers).get("Authorization")!);
    return Response.json({}, { status: bodies.length === 1 ? 401 : 201 });
  });
  const body = JSON.stringify({ title: "موضوع", description: "توضیحات", priority: "High" });
  assert.equal((await authenticatedFetch("/Tickets/v1/Tickets/Create", { method: "POST", body })).status, 201);
  assert.deepEqual(bodies, [body, body]); assert.deepEqual(tokens, ["Bearer backend.jwt.token", "Bearer new-access"]);
});

test("a late 401 from an old account is never retried using a newer login", async () => {
  respond(envelope()); await login(registration.mobile, registration.password); mock.restoreAll();
  let complete!: (response: Response) => void, started!: () => void, attempts = 0;
  const requestStarted = new Promise<void>(resolve => { started = resolve; });
  mock.method(globalThis, "fetch", async (path: string) => {
    if (path === "/api/v1/auth/login") return Response.json(envelope({ user: { ...user, id: 13 }, token: "another-account" }));
    attempts++; started(); return new Promise<Response>(resolve => { complete = resolve; });
  });
  const pending = authenticatedFetch("/Tickets/v1/Tickets/Create", { method: "POST", body: "{}" });
  await requestStarted;
  await login("other@example.test", "1234");
  complete(Response.json({}, { status: 401 }));
  await assert.rejects(pending, AuthApiError);
  assert.equal(attempts, 1); assert.equal((await getCurrentUser()).id, 13);
});

test("ticket creation requires both a client role and its permission; agents never qualify", () => {
  const client = { ...user, role: "client" as const };
  assert.equal(canCreateTicket(client), true);
  assert.equal(canCreateTicket({ ...client, permissions: [] }), false);
  assert.equal(canCreateTicket({ ...client, role: "agent" }), false);
  assert.equal(canCreateTicket({ ...client, role: "agent", permissions: [] }), false);
  assert.equal(canCreateTicket(null), false);
});
