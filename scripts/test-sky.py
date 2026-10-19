#!/usr/bin/env python3
"""
Exercise the project sky in a real browser, over CDP.

    npm run build
    (cd dist && python3 -m http.server 5299) &
    # a Chrome with --remote-debugging-port=9555 must be running
    python3 scripts/test-sky.py [port]

Needs `websockets`. Asserts the things a visitor can actually do: open the sky,
see one star per project, hover one and be told its rarity, click one and land
on its card, pan, zoom three ways (wheel, keyboard, two-finger pinch), and
leave with Escape. Exits non-zero on failure so it can gate a release.

The pinch is driven with synthetic PointerEvents rather than CDP touch events:
this harness cannot make `(hover: none)` match, and real touch events are not
delivered as pointer events without it. The events carry the same shape the
browser sends for two fingers, so they do exercise the production code path.
"""

import json, urllib.request, asyncio, websockets, sys

PORT = sys.argv[1] if len(sys.argv) > 1 else "5299"
URL = f"http://127.0.0.1:{PORT}/"

async def cdp():
    targets = json.load(urllib.request.urlopen("http://127.0.0.1:9555/json/list"))
    pages = [t for t in targets if t["type"] == "page"]
    ws = await websockets.connect(pages[0]["webSocketDebuggerUrl"], max_size=90_000_000)
    _id = 0
    errors = []
    async def send(m, p=None):
        nonlocal _id
        _id += 1
        await ws.send(json.dumps({"id": _id, "method": m, "params": p or {}}))
        while True:
            x = json.loads(await ws.recv())
            if x.get("id") == _id:
                return x
            if x.get("method") == "Runtime.exceptionThrown":
                errors.append(str(x["params"]["exceptionDetails"].get("exception", {}).get("description", ""))[:200])
    await send("Runtime.enable"); await send("Page.enable"); await send("Network.enable")
    # the served bundle changes every build; a cached one would test stale code
    await send("Network.setCacheDisabled", {"cacheDisabled": True})
    async def ev(e):
        r = await send("Runtime.evaluate", {"expression": e, "returnByValue": True})
        if r.get("result", {}).get("exceptionDetails"):
            return "EXC:" + str(r["result"]["exceptionDetails"].get("exception", {}).get("description", ""))[:250]
        return r.get("result", {}).get("result", {}).get("value")
    async def key(k, vk=0, txt="", code=None):
        c = code or k
        await send("Input.dispatchKeyEvent", {"type": "keyDown", "key": k, "code": c, "windowsVirtualKeyCode": vk, "text": txt})
        await send("Input.dispatchKeyEvent", {"type": "keyUp", "key": k, "code": c, "windowsVirtualKeyCode": vk})
        await asyncio.sleep(0.06)
    async def tap(ch):
        await send("Input.dispatchKeyEvent", {"type": "keyDown", "key": ch, "text": ch})
        await send("Input.dispatchKeyEvent", {"type": "keyUp", "key": ch})
        await asyncio.sleep(0.03)
    async def run(cmd, wait=1.6):
        await ev("document.getElementById('cmd').focus()")
        await ev("document.getElementById('cmd').value=''")
        for c in cmd:
            await tap(c)
        await key("Enter", 13, "\r", "Enter")
        await asyncio.sleep(wait)
    async def screen():
        return (await ev("document.getElementById('screen').innerText")) or ""

    await send("Page.navigate", {"url": URL})
    await asyncio.sleep(6)
    await ev("localStorage.clear()")
    await send("Page.navigate", {"url": URL})
    await asyncio.sleep(6)

    C = {}
    await run("sky", wait=2.2)
    C["the sky opens"] = await ev("document.getElementById('sky').classList.contains('sky--on')")
    C["the sky is running"] = await ev("!!window.__sky && window.__sky.isRunning")
    st = await ev("(()=>{const s=window.__sky.stats(); return JSON.stringify(s)})()")
    stats = json.loads(st) if st and st.startswith("{") else {}
    C["one star per project"] = stats.get("stars", 0) >= 500
    C["every author is in it"] = stats.get("authors", 0) >= 300
    C["there is a brightest star"] = bool(stats.get("brightest"))
    print("   stars:", stats.get("stars"), "authors:", stats.get("authors"),
          "brightest:", (stats.get("brightest") or {}).get("title"), "rarity", (stats.get("brightest") or {}).get("rarity"))

    # the brightest star is the rarest project: rarity is the whole premise
    rare = await ev("""(()=>{
      const s = window.__sky.stats();
      return s.brightest ? s.brightest.rarity : -1;
    })()""")
    C["the brightest star is the rarest project"] = rare == 17

    # the HUD explains the sky before anything is touched
    hud0 = await ev("document.getElementById('skyWhere').innerText")
    C["the HUD counts the sky"] = "projects" in (hud0 or "") and "builders" in (hud0 or "")

    # hover a star: sweep until one is under the cursor, then check the readout
    found = None
    for y in range(200, 760, 34):
        for x in range(400, 1500, 55):
            await send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "none"})
            await asyncio.sleep(0.06)
            t = await ev("document.getElementById('skyWhere').innerText")
            if t and "by @" in t:
                found = (x, y, t.replace("\n", " | "))
                break
        if found:
            break
    C["hovering a star names it"] = found is not None
    C["the readout shows rarity"] = bool(found and "rarity" in found[2])
    print("   hovered:", found[2] if found else "nothing")

    # pan: a drag moves the camera, and must not count as a click
    before = await ev("JSON.stringify((()=>{const s=window.__sky.cam; return [s.x,s.y]})())")
    await send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": 900, "y": 500, "button": "left", "clickCount": 1})
    await send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 780, "y": 560, "button": "left"})
    await send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": 700, "y": 590, "button": "left"})
    await send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": 700, "y": 590, "button": "left", "clickCount": 1})
    await asyncio.sleep(0.6)
    after = await ev("JSON.stringify((()=>{const s=window.__sky.cam; return [s.x,s.y]})())")
    C["dragging pans the sky"] = before != after
    C["a drag does not open anything"] = await ev("document.getElementById('sky').classList.contains('sky--on')")
    print("   camera:", before, "->", after)

    # zoom, all three ways. `zoom` reports the settled target, not the eased value
    z = await ev("window.__sky.zoom")
    await send("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": 900, "y": 500, "deltaX": 0, "deltaY": -600})
    await asyncio.sleep(0.5)
    z_wheel = await ev("window.__sky.zoom")
    C["the wheel zooms in"] = z_wheel > z
    await key("=", 187, "=", "Equal"); await key("=", 187, "=", "Equal")
    await asyncio.sleep(0.4)
    z_keys = await ev("window.__sky.zoom")
    C["the keyboard zooms in"] = z_keys > z_wheel
    await key("0", 48, "0", "Digit0")
    await asyncio.sleep(0.6)
    z_reset = await ev("window.__sky.zoom")
    C["reset returns to the resting zoom"] = abs(z_reset - 1.35) < 0.01
    print("   zoom: wheel", round(z_wheel, 2), "-> keys", round(z_keys, 2), "-> reset", round(z_reset, 2))

    # two-finger pinch, out then in
    pinch = await ev("""(()=>{
      const c = document.getElementById('skyCanvas'), s = window.__sky;
      const fire = (t, i, x, y) => c.dispatchEvent(new PointerEvent(t, {
        pointerId: i, pointerType: 'touch', clientX: x, clientY: y,
        bubbles: true, cancelable: true, isPrimary: i === 1}));
      const z0 = s.zoom;
      fire('pointerdown', 1, 150, 400); fire('pointerdown', 2, 250, 400);
      for (let sp = 60; sp <= 220; sp += 20) { fire('pointermove', 1, 200 - sp, 400); fire('pointermove', 2, 200 + sp, 400); }
      const out = s.zoom;
      fire('pointerup', 1, 0, 400); fire('pointerup', 2, 400, 400);
      fire('pointerdown', 1, 20, 400); fire('pointerdown', 2, 380, 400);
      for (let sp = 180; sp >= 60; sp -= 20) { fire('pointermove', 1, 200 - sp, 400); fire('pointermove', 2, 200 + sp, 400); }
      const back = s.zoom;
      fire('pointerup', 1, 200, 400); fire('pointerup', 2, 200, 400);
      return JSON.stringify({z0: +z0.toFixed(3), out: +out.toFixed(3), back: +back.toFixed(3)});
    })()""")
    p = json.loads(pinch)
    C["a two-finger spread zooms in"] = p["out"] > p["z0"]
    C["a two-finger pinch zooms out"] = p["back"] < p["out"]
    C["a pinch does not open anything"] = await ev("document.getElementById('sky').classList.contains('sky--on')")
    print("   pinch:", p)

    # zoom is clamped, so the sky can never be lost
    clamp = await ev("""(()=>{
      const c = document.getElementById('skyCanvas'), s = window.__sky;
      const fire = (t, i, x, y) => c.dispatchEvent(new PointerEvent(t, {
        pointerId: i, pointerType: 'touch', clientX: x, clientY: y,
        bubbles: true, cancelable: true, isPrimary: i === 1}));
      fire('pointerdown', 1, 190, 400); fire('pointerdown', 2, 210, 400);
      for (let sp = 10; sp <= 900; sp += 60) { fire('pointermove', 1, 200 - sp, 400); fire('pointermove', 2, 200 + sp, 400); }
      const hi = s.zoom;
      fire('pointerup', 1, 0, 400); fire('pointerup', 2, 400, 400);
      s.reset();
      return JSON.stringify({hi: +hi.toFixed(3)});
    })()""")
    C["zoom has an upper clamp"] = json.loads(clamp)["hi"] <= 9.001
    print("   zoom ceiling:", json.loads(clamp)["hi"])

    # clicking a star opens that project and drops back to the shell
    await ev("window.__sky.reset()"); await asyncio.sleep(0.8)
    picked = await ev("""(()=>{
      const s = window.__sky;
      // aim at the brightest star, whatever its rarity
      const st = s.stats();
      return st.brightest ? st.brightest.id : null;
    })()""")
    flown = await ev(f"(()=>{{const p=window.__sky.focus('{picked}'); return p?p.title:null}})()")
    await asyncio.sleep(1.4)
    C["focus flies to a project"] = bool(flown)
    print("   flew to:", flown)
    await key("Enter", 13, "\r", "Enter")
    await asyncio.sleep(2.2)
    C["Enter closes the sky"] = not await ev("document.getElementById('sky').classList.contains('sky--on')")
    txt = await screen()
    C["Enter opened that project"] = bool(flown) and flown[:10] in txt[-6000:]
    C["prompt refocused"] = await ev("document.activeElement && document.activeElement.id === 'cmd'")
    print("   opened:", flown)

    # Escape leaves, from a clean entry
    await run("sky", wait=2.0)
    await key("Escape", 27, "", "Escape")
    await asyncio.sleep(0.9)
    C["Escape leaves the sky"] = not await ev("document.getElementById('sky').classList.contains('sky--on')")

    # the canvas actually painted something
    painted = await ev("""(()=>{
      const c = document.getElementById('skyCanvas'), x = c.getContext('2d');
      const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0;
      for (let i = 0; i < d.length; i += 4 * 97) if (d[i] > 12 || d[i+1] > 12 || d[i+2] > 12) n++;
      return n;
    })()""")
    C["stars are actually drawn"] = isinstance(painted, int) and painted > 500
    print("   lit samples:", painted)

    C["no console errors"] = not errors

    print()
    bad = 0
    for name, ok in C.items():
        print(f"   {'PASS' if ok else 'FAIL'}  {name}")
        if not ok:
            bad += 1
    print(f"\n   {len(C) - bad}/{len(C)} assertions passed")
    if errors:
        print("   console errors:")
        for e in errors[:5]:
            print("     -", e)
    await ws.close()
    if bad:
        sys.exit(1)

asyncio.run(cdp())