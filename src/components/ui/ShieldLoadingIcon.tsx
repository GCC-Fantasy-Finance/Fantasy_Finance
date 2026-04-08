import { useEffect } from "react";

export default function ShieldLoadingIcon() {
  useEffect(() => {
    const T = {
      startHold: 200,
      wipeBarStagger: 120,
      wipeBarDur: 260,
      arrowUndrawDur: 900,
      shieldPause: 380,
      arrowDrawDur: 900,
      barDelay: 160,
      barStagger: 200,
      barGrowDur: 420,
      endHold: 550,
    };
    const N = 4;
    const AH_W = 34;
    const AH_X = 174.47;

    const barRects = [0, 1, 2, 3].map((i) =>
      document.getElementById("br" + i)
    );
    const trendline = document.getElementById("trendline");
    const arrowheadRect = document.getElementById("ahr");
    const VB_H = 286.11;

    function easeOut(t: number) {
      return 1 - Math.pow(1 - t, 3);
    }

    function easeIn(t: number) {
      return t * t * (3 - 2 * t);
    }

    const anims: Array<{
      startTime: number;
      dur: number;
      from: number;
      to: number;
      ease: (t: number) => number;
      onUpdate: (v: number) => void;
      onDone: (() => void) | null;
    }> = [];

    function addAnim(
      startTime: number,
      dur: number,
      from: number,
      to: number,
      ease: (t: number) => number,
      onUpdate: (v: number) => void,
      onDone?: () => void
    ) {
      anims.push({
        startTime,
        dur,
        from,
        to,
        ease,
        onUpdate,
        onDone: onDone || null,
      });
    }

    function tick(now: number) {
      let i = anims.length;
      while (i--) {
        const a = anims[i];
        const elapsed = now - a.startTime;
        if (elapsed < 0) continue;
        const raw = Math.min(elapsed / (a.dur || 1), 1);
        const eased = a.ease(raw);
        a.onUpdate(a.from + (a.to - a.from) * eased);
        if (raw >= 1) {
          if (a.onDone) a.onDone();
          anims.splice(i, 1);
        }
      }
      requestAnimationFrame(tick);
    }

    function setBarClip(
      i: number,
      visible: boolean,
      startTime: number,
      dur: number,
      easeFn: (t: number) => number
    ) {
      const r = barRects[i];
      if (!r) return;
      if (visible) {
        // Fill top-down: y fixed at 0, height grows from 0 → VB_H
        addAnim(startTime, dur, 0, VB_H, easeFn, (v) => {
          r.setAttribute("y", "0");
          r.setAttribute("height", String(v));
        });
      } else {
        // Wipe top-down: bottom edge fixed at VB_H, y slides down
        const fromY = parseFloat(r.getAttribute("y") || "0");
        const fromH = parseFloat(r.getAttribute("height") || "0");
        addAnim(startTime, dur, 0, 1, easeFn, (p) => {
          r.setAttribute("y", String(fromY + (VB_H - fromY) * p));
          r.setAttribute("height", String(fromH + (0 - fromH) * p));
        });
      }
    }

    function animateDraw(
      startTime: number,
      dur: number,
      easeFn: (t: number) => number,
      from: number = 1,
      onDone?: () => void
    ) {
      if (!trendline) return;
      addAnim(startTime, dur, from, 0, easeFn, (v) => {
        if (trendline) {
          trendline.setAttribute("stroke-dashoffset", String(v));
        }
      }, onDone);
    }

    function animateUndraw(
      startTime: number,
      dur: number,
      easeFn: (t: number) => number,
      onDone?: () => void
    ) {
      if (!trendline) return;
      const from = parseFloat(trendline.getAttribute("stroke-dashoffset") || "0");
      addAnim(startTime, dur, from, -1, easeFn, (v) => {
        if (trendline) {
          trendline.setAttribute("stroke-dashoffset", String(v));
        }
      }, onDone);
    }

    function animateArrowhead(
      show: boolean,
      startTime: number,
      dur: number,
      easeFn: (t: number) => number
    ) {
      if (!arrowheadRect) return;
      const fromW = parseFloat(arrowheadRect.getAttribute("width") || "0");
      const fromX = parseFloat(arrowheadRect.getAttribute("x") || "174.47");
      if (show) {
        addAnim(startTime, dur, 0, 1, easeFn, (p) => {
          if (arrowheadRect) {
            arrowheadRect.setAttribute("x", String(AH_X));
            arrowheadRect.setAttribute("width", String(AH_W * p));
          }
        });
      } else {
        addAnim(startTime, dur, 0, 1, easeFn, (p) => {
          if (arrowheadRect) {
            arrowheadRect.setAttribute(
              "x",
              String(fromX + (AH_W - fromW) + fromW * p)
            );
            arrowheadRect.setAttribute("width", String(fromW * (1 - p)));
          }
        });
      }
    }

    function scheduleLoop(baseTime: number) {
      let t = baseTime;

      t += T.startHold;

      for (let i = N - 1; i >= 0; i--) {
        setBarClip(
          i,
          false,
          t + (N - 1 - i) * T.wipeBarStagger,
          T.wipeBarDur,
          easeIn
        );
      }
      t += N * T.wipeBarStagger + T.wipeBarDur;

      animateUndraw(t, T.arrowUndrawDur, easeIn);
      animateArrowhead(false, t + T.arrowUndrawDur * 0.72, T.arrowUndrawDur * 0.28, easeIn);
      t += T.arrowUndrawDur;

      t += T.shieldPause;

      animateDraw(t, T.arrowDrawDur, easeOut, 1);
      animateArrowhead(true, t + T.arrowDrawDur * 0.82, T.arrowDrawDur * 0.18, easeOut);
      t += T.arrowDrawDur;

      t += T.barDelay;
      for (let i = 0; i < N; i++) {
        setBarClip(i, true, t + i * T.barStagger, T.barGrowDur, easeOut);
      }
      t += N * T.barStagger + T.barGrowDur;

      t += T.endHold;
      addAnim(t, 1, 0, 1, easeIn, () => {}, () => {
        resetState();
        scheduleLoop(t);
      });
    }

    function resetState() {
      barRects.forEach((r) => {
        if (r) {
          r.setAttribute("y", "0");
          r.setAttribute("height", String(VB_H));
        }
      });
      if (trendline) {
        trendline.setAttribute("stroke-dasharray", "1 1");
        trendline.setAttribute("stroke-dashoffset", "0");
      }
      if (arrowheadRect) {
        arrowheadRect.setAttribute("width", String(AH_W));
      }
    }

    resetState();
    const start = performance.now();
    scheduleLoop(start);
    requestAnimationFrame(tick);

    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <svg
      viewBox="0 0 230.75 286.11"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      <defs>
        <clipPath id="sc">
          <path d="M110.55,285.08c3.07,1.37,6.58,1.37,9.65,0,68.99-30.76,110.55-82.43,110.55-137.83V38c0-5.34-3.61-10.01-8.78-11.35L123.65,1.06c-5.42-1.41-11.12-1.41-16.54,0L8.78,26.65c-5.17,1.35-8.78,6.01-8.78,11.35v109.24c0,55.41,41.56,107.07,110.55,137.83Z" />
        </clipPath>

        <clipPath id="bc0">
          <rect id="br0" x="35.71" width="29.89" y="0" height="286.11" />
        </clipPath>
        <clipPath id="bc1">
          <rect id="br1" x="78.86" width="29.89" y="0" height="286.11" />
        </clipPath>
        <clipPath id="bc2">
          <rect id="br2" x="122.01" width="29.89" y="0" height="286.11" />
        </clipPath>
        <clipPath id="bc3">
          <rect id="br3" x="165.16" width="29.89" y="0" height="286.11" />
        </clipPath>

        <clipPath id="ahc">
          <rect id="ahr" x="174.47" y="40" width="34" height="46" />
        </clipPath>
      </defs>

      <path
        d="M110.55,285.08c3.07,1.37,6.58,1.37,9.65,0,68.99-30.76,110.55-82.43,110.55-137.83V38c0-5.34-3.61-10.01-8.78-11.35L123.65,1.06c-5.42-1.41-11.12-1.41-16.54,0L8.78,26.65c-5.17,1.35-8.78,6.01-8.78,11.35v109.24c0,55.41,41.56,107.07,110.55,137.83Z"
        fill="#16a34a"
      />

      <g clipPath="url(#bc0)">
        <path
          d="M115.38,257.57c-55.4-26.52-88.38-67.61-88.38-110.32V49.8l88.38-23,88.38,23v97.44c0,42.71-32.98,83.8-88.38,110.32Z"
          fill="#98d3b2"
        />
      </g>
      <g clipPath="url(#bc1)">
        <path
          d="M115.38,257.57c-55.4-26.52-88.38-67.61-88.38-110.32V49.8l88.38-23,88.38,23v97.44c0,42.71-32.98,83.8-88.38,110.32Z"
          fill="#98d3b2"
        />
      </g>
      <g clipPath="url(#bc2)">
        <path
          d="M115.38,257.57c-55.4-26.52-88.38-67.61-88.38-110.32V49.8l88.38-23,88.38,23v97.44c0,42.71-32.98,83.8-88.38,110.32Z"
          fill="#98d3b2"
        />
      </g>
      <g clipPath="url(#bc3)">
        <path
          d="M115.38,257.57c-55.4-26.52-88.38-67.61-88.38-110.32V49.8l88.38-23,88.38,23v97.44c0,42.71-32.98,83.8-88.38,110.32Z"
          fill="#98d3b2"
        />
      </g>

      <g clipPath="url(#sc)">
        <rect x="22.45" y="38.08" width="13.26" height="161.71" fill="#16a34a" />
        <rect x="65.60" y="20.41" width="13.26" height="218.82" fill="#16a34a" />
        <rect x="108.75" y="20.41" width="13.26" height="237.16" fill="#16a34a" />
        <rect x="151.90" y="20.41" width="13.26" height="218.82" fill="#16a34a" />
        <rect x="195.05" y="38.08" width="13.26" height="161.71" fill="#16a34a" />
        <path
          d="M27,207.8l-11.1-67.57,4.99-98.06,93.46-20.51,98.1,20.51,1.91,36.18-58.29,75.67-10.92,14.18c-3.14,4.08-9.01,4.82-13.07,1.63l-14.08-11.05-26.51-20.81L27,207.8Z"
          fill="#16a34a"
        />
      </g>

      <polyline
        id="trendline"
        points="35.74,160.55 88.58,103.35 134.69,139.55 192.98,63.88"
        stroke="white"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength="1"
        strokeDasharray="1 1"
        strokeDashoffset="0"
      />

      <g clipPath="url(#ahc)">
        <polygon
          id="arrowhead"
          points="205.23,47.98 174.47,58.24 203.15,80.34"
          fill="white"
          stroke="white"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
