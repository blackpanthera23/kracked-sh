#!/usr/bin/env python3
"""
Exercise the city in a real browser, over CDP.

    npm run build
    (cd dist && python3 -m http.server 5299) &
    # a Chrome with --remote-debugging-port=9555 must be running
    python3 scripts/test-city.py [port]

Needs `websockets`. Asserts the things a visitor can actually do: open the city,
walk with WASD and the arrows, hold a key, get blocked by a building, walk to a
project, tap a building to reach its door, and open it. Exits non-zero on
failure so it can gate a release.
"""

import json, urllib.request, asyncio, websockets, base64, sys

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
    await send("Runtime.enable"); await send("Page.enable")
    async def ev(e):
        r = await send("Runtime.evaluate", {"expression": e, "returnByValue": True})
        if r.get("result", {}).get("exceptionDetails"):
            return "EXC:" + str(r["result"]["exceptionDetails"].get("exception", {}).get("description", ""))[:250]
        return r.get("result", {}).get("result", {}).get("value")
    async def key(k):
        vk = {"Enter": 13, "ArrowUp": 38, "ArrowDown": 40, "ArrowLeft": 37, "ArrowRight": 39, "Escape": 27}.get(k, 0)
        txt = "\r" if k == "Enter" else ""
        await send("Input.dispatchKeyEvent", {"type": "keyDown", "key": k, "code": k, "windowsVirtualKeyCode": vk, "text": txt})
        await send("Input.dispatchKeyEvent", {"type": "keyUp", "key": k, "code": k, "windowsVirtualKeyCode": vk})
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
        await key("Enter")
        await asyncio.sleep(wait)
    async def screen():
        return (await ev("document.getElementById('screen').innerText")) or ""
    async def pos():
        return await ev("window.__city ? [window.__city.x, window.__city.y] : null")

    await send("Page.navigate", {"url": URL})
    await asyncio.sleep(6)
    await ev("localStorage.clear()")
    await send("Page.navigate", {"url": URL})
    await asyncio.sleep(6)

    C = {}
    await run("explore", wait=2.0)
    C["city opens"] = await ev("document.getElementById('city').classList.contains('city--on')")
    n = await ev("window.__city.buildings.length")
    C["the city is built out"] = n >= 400
    print("   buildings placed:", n)

    # walkTo shows the right building
    tid = await ev("window.__city.buildings[2].id")
    title = await ev("window.__city.buildings[2].title")
    walked = await ev(f"(()=>{{const b=window.__city.walkTo('{tid}'); return b?b.title:null}})()")
    where = await ev("document.getElementById('cityWhere').innerText")
    C["walkTo lands on the building"] = walked == title
    C["the prompt names it"] = title[:10] in (where or "")
    C["the prompt offers Enter"] = "press Enter" in (where or "")
    print("   walked to:", walked)

    # Enter opens it and drops back to the shell
    await key("Enter")
    await asyncio.sleep(2.2)
    C["Enter closes the city"] = not await ev("document.getElementById('city').classList.contains('city--on')")
    txt = await screen()
    C["Enter opened that project"] = title[:10] in txt[-4000:]
    C["prompt refocused"] = await ev("document.activeElement && document.activeElement.id === 'cmd'")
    C["no console errors"] = not errors


    # tapping a building walks to its door, and the HUD names it
    await run("explore", wait=2.0)   # Enter above left the city
    await ev("window.__city.x=7; window.__city.y=6; window.__city.route=null; window.__city.held.clear(); window.__city.draw();")
    tapinfo = await ev("""(()=>{
      const c=window.__city, m=document.getElementById('cityMap');
      const r=m.getBoundingClientRect(), cs=getComputedStyle(m);
      const probe=document.createElement('span'); probe.textContent='0'; m.appendChild(probe);
      const cw=probe.getBoundingClientRect().width; probe.remove();
      const lh=r.height/(c.height+0.5);
      const gutter=String(c.width).length+1;
      const b=c.buildings.find(b=>b.x>20&&b.x<36&&b.y>6&&b.y<14);
      if(!b) return null;
      return {tx:b.x, ty:b.y, title:b.title, doorX:b.x+Math.floor(b.w/2), doorY:b.y+b.h-1,
              left:r.left, top:r.top, padTop:parseFloat(cs.paddingTop)||0, cw, lh, gutter};
    })()""")
    if tapinfo:
        cx = tapinfo["left"] + (tapinfo["tx"] + tapinfo["gutter"] + 0.5) * tapinfo["cw"]
        cy = tapinfo["top"] + tapinfo["padTop"] + (tapinfo["ty"] + 0.5) * tapinfo["lh"]
        await send("Input.dispatchMouseEvent", {"type": "mousePressed", "x": cx, "y": cy, "button": "left", "clickCount": 1})
        await send("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": cx, "y": cy, "button": "left", "clickCount": 1})
        routed = await ev("window.__city.route")
        C["tapping a building routes to its door"] = routed == [tapinfo["doorX"], tapinfo["doorY"]]
        for _ in range(20):
            await asyncio.sleep(0.6)
            if await pos() == [tapinfo["doorX"], tapinfo["doorY"]]: break
        C["the tap walk arrives"] = await pos() == [tapinfo["doorX"], tapinfo["doorY"]]
        C["the tapped building is named"] = tapinfo["title"][:10] in (await ev("document.getElementById('cityWhere').innerText") or "")
        print("   tapped:", tapinfo["title"][:30], "->", await pos())
    else:
        C["a building to tap"] = False


    # movement, tested from a spot that is actually open in the pressed direction
    await run("explore", wait=2.0)
    # the tap walk above leaves a held key behind; clear it the way Esc would
    await key("Escape")
    await run("explore", wait=2.0)
    async def open_spot():
        return await ev("""(()=>{
          const c=window.__city;
          for(let x=2;x<c.w-2;x++){
            if(c.walkable(x,3)&&c.walkable(x,4)&&c.walkable(x,5)){
              c.x=x;c.y=3;c.draw(); return [x,3];
            }
          }
          return null;
        })()""")
    await open_spot()
    p0 = await pos()
    await key("ArrowRight")
    p1 = await pos()
    await key("ArrowDown")
    p2 = await pos()
    C["arrow right"] = p1[0] == p0[0] + 1
    C["arrow down"] = p2[1] == p1[1] + 1
    print("   walk:", p0, p1, p2)
    # WASD from a fresh open spot, so a wall is never what the assertion sees
    await open_spot()
    q0 = await pos()
    await tap("d")
    q1 = await pos()
    await tap("s")
    q2 = await pos()
    C["WASD d"] = q1[0] == q0[0] + 1
    C["WASD s"] = q2[1] == q1[1] + 1
    print("   wasd:", q0, q1, q2)

    # a held key walks continuously
    await open_spot()
    h0 = await pos()
    await send("Input.dispatchKeyEvent", {"type": "keyDown", "key": "ArrowDown", "code": "ArrowDown", "windowsVirtualKeyCode": 40})
    await asyncio.sleep(0.7)
    await send("Input.dispatchKeyEvent", {"type": "keyUp", "key": "ArrowDown", "code": "ArrowDown", "windowsVirtualKeyCode": 40})
    h1 = await pos()
    C["holding a key walks"] = h1[1] - h0[1] >= 5
    C["keys clear on release"] = await ev("window.__city.held.size") == 0
    print("   held:", h0, "->", h1)

    # a building blocks movement
    blocked = await ev("""(()=>{
      const c=window.__city;
      for(const b of c.buildings){
        for(let dx=0;dx<b.w;dx++){
          const bx=b.x+dx, by=b.y;
          if(c.walkable(bx,by-1) && !c.walkable(bx,by)){
            c.x=bx; c.y=by-1; c.draw(); return [bx,by];
          }
        }
      }
      return null;
    })()""")
    if blocked:
        bpos = await pos()
        await key("ArrowDown")
        apos = await pos()
        C["a wall blocks movement"] = bpos == apos
        print("   wall at", blocked, "player", bpos, "->", apos)

    print()
    print("=== CITY ===")
    for k, v in C.items():
        print(f"  {'PASS' if v else 'FAIL'}  {k}")
    failed = [k for k, v in C.items() if not v]
    print()
    print("failures:", failed or "none")
    print("errors:", errors[:3] if errors else "none")

    # keep a shot of the final state for eyeballing
    s = await send("Page.captureScreenshot", {"format": "png"})
    open("/tmp/city-shot.png", "wb").write(base64.b64decode(s["result"]["data"]))
    await ws.close()
    if failed or errors:
        sys.exit(1)

asyncio.run(cdp())