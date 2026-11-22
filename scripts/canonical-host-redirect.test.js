import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalHostRedirect } from "./canonical-host-redirect.js";

test("www redirects to the canonical origin, preserving the path and attribution", () => {
  for (const host of ["www.immeubleassur.com", "WWW.IMMEUBLEASSUR.COM", "www.immeubleassur.com:443"]) {
    for (const method of ["GET", "HEAD"]) {
      assert.equal(canonicalHostRedirect({ method, headers: { host }, url: "/devis-assurance-immeuble?intent=sci&utm_source=partner" }), "https://immeubleassur.com/devis-assurance-immeuble?intent=sci&utm_source=partner");
    }
  }
});

test("apex, local probes and untrusted forwarded hosts never redirect", () => {
  for (const host of ["immeubleassur.com", "127.0.0.1:8871", "localhost", "www.immeubleassur.com.evil.example", "evil.example"]) {
    assert.equal(canonicalHostRedirect({ headers: { host, "x-forwarded-host": "www.immeubleassur.com" }, url: "/health" }), "");
  }
});

test("submissions keep their method and endpoint", () => {
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    assert.equal(canonicalHostRedirect({ method, headers: { host: "www.immeubleassur.com" }, url: "/api/leads" }), "");
  }
});

test("a request target cannot redirect to a different origin", () => {
  for (const url of ["//evil.example/path?x=1", "https://evil.example/path?x=1"]) {
    assert.equal(canonicalHostRedirect({ headers: { host: "www.immeubleassur.com" }, url }), "https://immeubleassur.com/path?x=1");
  }
});


test("native HTTP serving redirects www without looping on apex or local requests", async (t) => {
  const { createServer, request } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, "127.0.0.1", resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const child = spawn(process.execPath, ["scripts/local-static-server.js"], { env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" }, windowsHide: true, stdio: "ignore" });
  t.after(() => child.kill());
  const get = (host, method = "GET", path = "/?utm_source=partner") => new Promise((resolve, reject) => {
    const req = request({hostname:"127.0.0.1",port,method,path,headers:{host}}, res => {
      let body="";res.setEncoding("utf8");res.on("data", chunk => body+=chunk);res.on("end", () => resolve({status:res.statusCode,location:res.headers.location,body}));
    });
    req.on("error",reject);req.setTimeout(3000,()=>req.destroy(new Error("HTTP timeout")));req.end();
  });
  let ready=false;
  for(let i=0;i<100;i++){try{await get("127.0.0.1:"+port);ready=true;break;}catch{await new Promise(resolve=>setTimeout(resolve,50));}}
  assert.ok(ready,"Local static server starts");
  const redirected=await get("www.immeubleassur.com");
  assert.equal(redirected.status,301);
  assert.equal(redirected.location,"https://immeubleassur.com/?utm_source=partner");
  const head=await get("www.immeubleassur.com","HEAD");
  assert.equal(head.status,301);assert.equal(head.body,"");
  assert.equal((await get("immeubleassur.com")).status,200);
  assert.equal((await get("127.0.0.1:"+port)).status,200);
  assert.notEqual((await get("www.immeubleassur.com","POST","/api/leads")).status,301);
});
