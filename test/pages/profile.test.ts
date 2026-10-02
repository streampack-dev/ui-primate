import { beforeEach, describe, expect, it } from "vitest";
import { text } from "../support/page.ts";
import { signedIn } from "../support/readers.ts";
import { list, post, requests, resetStubs, stub, stubSite } from "../support/stub.ts";
import { Visitor } from "../support/visitor.ts";

beforeEach(async () => {
  await resetStubs();
  await stubSite();
  await stub("/posts", list([post()]), { query: { page: 0, size: 9 } });
  await stub("/posts/popular", list([]), { query: { page: 0, size: 3 } });
});

const sent = async (path: string) => (await requests()).filter((r) => r.method !== "GET" && r.path === path);

describe("the profile page", () => {
  it("sends a reader who isn't signed in to sign in, and back", async () => {
    const { status, location } = await new Visitor().get("/profile");
    expect(status).toBe(303);
    expect(location).toBe("/login?return=%2Fprofile");
  });

  it("shows who the reader is, and is theirs alone", async () => {
    const v = await signedIn();
    const response = await v.get("/profile");
    const main = response.doc.querySelector("main")!;

    expect(response.status).toBe(200);
    expect(text(main.querySelector("h1"))).toBe("Joe O");
    expect(text(main)).toContain("joe");
    expect(text(main)).toContain("USER");
    expect(main.querySelector("form[action='/profile'] input[name=displayName]")?.getAttribute("value")).toBe("Joe O");
    expect(main.querySelector("a[href='/profile/export']")).not.toBeNull();
    // The username to type to delete the account, as it's typed, not in the label's capitals.
    expect(text(main.querySelector("label[for=delete-confirm] code.as-typed"))).toBe("joe");
  });
});

describe("changing the display name", () => {
  it("saves it as the reader, and shows it everywhere at once", async () => {
    await stub("/auth/profile", { id: "u", username: "joe", displayName: "Joseph", role: "USER" }, { method: "PUT" });
    const v = await signedIn();
    const done = await v.post("/profile", { displayName: " Joseph " });

    expect(done.status).toBe(303);
    expect(done.location).toBe("/profile?saved=1");
    const [put] = await sent("/auth/profile");
    expect(put.method).toBe("PUT");
    expect(put.headers.authorization).toBe("Bearer access-1");
    expect(put.body).toEqual({ displayName: "Joseph" });

    const { doc } = await v.get(done.location!);
    expect(text(doc.querySelector("[role=status]"))).toBe("Saved.");
    expect(text(doc.querySelector("header"))).toContain("Joseph");
  });

  it("wants a name, and sends nothing without one", async () => {
    const v = await signedIn();
    const { status, doc } = await v.post("/profile", { displayName: "  " });

    expect(status).toBe(400);
    expect(text(doc.querySelector("#display-name-error"))).toBe("Your display name can't be blank.");
    expect(await sent("/auth/profile")).toEqual([]);
  });

  it("sends nothing when nothing changed", async () => {
    const v = await signedIn();
    const done = await v.post("/profile", { displayName: "Joe O" });

    expect(done.location).toBe("/profile?saved=0");
    expect(text((await v.get(done.location!)).doc.querySelector("[role=status]"))).toBe("Nothing changed.");
    expect(await sent("/auth/profile")).toEqual([]);
  });

  it("says what the API says when it won't take the name, keeping what was typed", async () => {
    await stub("/auth/profile", { status: 400, detail: "That display name is taken." }, { method: "PUT", status: 400 });
    const v = await signedIn();
    const { status, doc } = await v.post("/profile", { displayName: "Ada" });

    expect(status).toBe(400);
    expect(text(doc.querySelector("#display-name-error"))).toBe("That display name is taken.");
    expect(doc.querySelector("input[name=displayName]")?.getAttribute("value")).toBe("Ada");
  });

  it("refuses a form posted without the reader's anti-forgery token", async () => {
    const v = await signedIn();
    expect((await v.post("/profile", { displayName: "X" }, { csrf: false })).status).toBe(403);
    expect(await sent("/auth/profile")).toEqual([]);
  });
});

describe("exporting the reader's data", () => {
  it("downloads what the API exports, as the reader, never cached", async () => {
    await stub("/auth/export", { user: { username: "joe" }, posts: [] });
    const v = await signedIn();
    const response = await fetch(`${(await import("vitest")).inject("appUrl")}/profile/export`, {
      headers: { Cookie: `session_id=${v.cookies.get("session_id")}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="bytecode-news-joe.json"');
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ user: { username: "joe" }, posts: [] });
    expect((await requests()).find((r) => r.path === "/auth/export")!.headers.authorization).toBe("Bearer access-1");
  });

  it("is for signed-in readers only", async () => {
    const { status, location } = await new Visitor().get("/profile/export");
    expect(status).toBe(303);
    expect(location).toBe("/login?return=%2Fprofile");
  });
});

describe("deleting the reader's account", () => {
  it("wants the reader's username typed first", async () => {
    const v = await signedIn();
    const { status, doc } = await v.post("/profile/delete", { confirm: "someone" });
    const section = doc.querySelector("details.profile-delete")!;

    expect(status).toBe(400);
    expect(section.hasAttribute("open")).toBe(true);
    expect(text(section.querySelector(".form-error"))).toBe("That isn't your username. Type joe to delete this account.");
    expect(section.querySelector("input[name=confirm]")?.getAttribute("value")).toBe("someone");
    expect(await sent("/auth/account")).toEqual([]);
  });

  it("erases the reader's own account, signs them out and says so", async () => {
    await stub("/auth/account", { message: "Deleted." }, { method: "DELETE" });
    const v = await signedIn();
    const done = await v.post("/profile/delete", { confirm: " joe " });

    expect(done.status).toBe(303);
    expect(done.location).toBe("/profile/deleted");
    const [erase] = await sent("/auth/account");
    expect(erase.method).toBe("DELETE");
    expect(erase.headers.authorization).toBe("Bearer access-1");
    // Always the reader's own: the API lets admins name others.
    expect(erase.body).toEqual({ username: "joe" });
    const after = await v.get("/profile/deleted");
    expect(text(after.doc.querySelector("main"))).toContain("Your account has been deleted.");
    expect(text(after.doc.querySelector("header"))).toContain("Log in");
  });

  it("says what the API says when it won't, keeping the reader signed in", async () => {
    await stub("/auth/account", { status: 409, detail: "Hand over your posts first." }, { method: "DELETE", status: 409 });
    const v = await signedIn();
    const { status, doc } = await v.post("/profile/delete", { confirm: "joe" });

    expect(status).toBe(400);
    expect(text(doc.querySelector("details.profile-delete .form-error"))).toBe("Hand over your posts first.");
    expect(text(doc.querySelector("header"))).toContain("Joe O");
  });
});
