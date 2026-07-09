(function () {
  'use strict';

  var TWO_PI = Math.PI * 2;

  var options = {
    dotRadius: 2,
    dotSpacing: 16,
    cursorRadius: 500,
    cursorForce: 0.1,
    bulgeOnly: true,
    bulgeStrength: 69,
    glowRadius: 190,
    sparkle: false,
    waveAmplitude: 0,
    gradientFrom: 'rgba(255, 255, 255, 0.45)',
    gradientTo: 'rgba(255, 255, 255, 0.22)',
    glowColor: '#120F17',
  };

  function init() {
    var container = document.getElementById('dot-field-bg');
    if (!container) return;

    var canvas = document.createElement('canvas');
    container.appendChild(canvas);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    var defs = document.createElementNS(svgNS, 'defs');
    var gradId = 'dot-field-glow-' + Math.random().toString(36).slice(2, 9);
    var radialGradient = document.createElementNS(svgNS, 'radialGradient');
    radialGradient.setAttribute('id', gradId);
    var stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', options.glowColor);
    var stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '100%');
    stop2.setAttribute('stop-color', 'transparent');
    radialGradient.appendChild(stop1);
    radialGradient.appendChild(stop2);
    defs.appendChild(radialGradient);
    svg.appendChild(defs);

    var glowEl = document.createElementNS(svgNS, 'circle');
    glowEl.setAttribute('cx', '-9999');
    glowEl.setAttribute('cy', '-9999');
    glowEl.setAttribute('r', String(options.glowRadius));
    glowEl.setAttribute('fill', 'url(#' + gradId + ')');
    glowEl.style.opacity = '0';
    glowEl.style.willChange = 'opacity';
    svg.appendChild(glowEl);
    container.appendChild(svg);

    var ctx = canvas.getContext('2d', { alpha: true });
    var dpr = Math.min(window.devicePixelRatio || 1, 2);

    var dots = [];
    var size = { w: 0, h: 0, offsetX: 0, offsetY: 0 };
    var mouse = { x: -9999, y: -9999, prevX: -9999, prevY: -9999, speed: 0 };
    var glowOpacity = 0;
    var engagement = 0;
    var frameCount = 0;
    var resizeTimer = null;
    var rafId = null;

    function buildDots(w, h) {
      var step = options.dotRadius + options.dotSpacing;
      var cols = Math.floor(w / step);
      var rows = Math.floor(h / step);
      var padX = (w % step) / 2;
      var padY = (h % step) / 2;
      var next = new Array(rows * cols);
      var idx = 0;

      for (var row = 0; row < rows; row++) {
        for (var col = 0; col < cols; col++) {
          var ax = padX + col * step + step / 2;
          var ay = padY + row * step + step / 2;
          next[idx++] = { ax: ax, ay: ay, sx: ax, sy: ay, vx: 0, vy: 0, x: ax, y: ay };
        }
      }
      dots = next;
    }

    function doResize() {
      var rect = container.getBoundingClientRect();
      var w = rect.width;
      var h = rect.height;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      size = {
        w: w,
        h: h,
        offsetX: rect.left + window.scrollX,
        offsetY: rect.top + window.scrollY,
      };

      buildDots(w, h);
    }

    function resize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(doResize, 100);
    }

    function onMouseMove(e) {
      mouse.x = e.pageX - size.offsetX;
      mouse.y = e.pageY - size.offsetY;
    }

    function updateMouseSpeed() {
      var dx = mouse.prevX - mouse.x;
      var dy = mouse.prevY - mouse.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      mouse.speed += (dist - mouse.speed) * 0.5;
      if (mouse.speed < 0.001) mouse.speed = 0;
      mouse.prevX = mouse.x;
      mouse.prevY = mouse.y;
    }

    var speedInterval = setInterval(updateMouseSpeed, 20);

    function tick() {
      frameCount++;
      var len = dots.length;
      var t = frameCount * 0.02;

      var targetEngagement = Math.min(mouse.speed / 5, 1);
      engagement += (targetEngagement - engagement) * 0.06;
      if (engagement < 0.001) engagement = 0;
      var eng = engagement;

      glowOpacity += (eng - glowOpacity) * 0.08;

      glowEl.setAttribute('cx', String(mouse.x));
      glowEl.setAttribute('cy', String(mouse.y));
      glowEl.style.opacity = String(glowOpacity);

      ctx.clearRect(0, 0, size.w, size.h);

      var grad = ctx.createLinearGradient(0, 0, size.w, size.h);
      grad.addColorStop(0, options.gradientFrom);
      grad.addColorStop(1, options.gradientTo);
      ctx.fillStyle = grad;

      var cr = options.cursorRadius;
      var crSq = cr * cr;
      var rad = options.dotRadius / 2;
      var isBulge = options.bulgeOnly;

      ctx.beginPath();

      for (var i = 0; i < len; i++) {
        var d = dots[i];
        var dx = mouse.x - d.ax;
        var dy = mouse.y - d.ay;
        var distSq = dx * dx + dy * dy;

        if (distSq < crSq && eng > 0.01) {
          var dist = Math.sqrt(distSq);
          if (isBulge) {
            var tt = 1 - dist / cr;
            var push = tt * tt * options.bulgeStrength * eng;
            var angle = Math.atan2(dy, dx);
            d.sx += (d.ax - Math.cos(angle) * push - d.sx) * 0.15;
            d.sy += (d.ay - Math.sin(angle) * push - d.sy) * 0.15;
          } else {
            var angle2 = Math.atan2(dy, dx);
            var move = (500 / dist) * (mouse.speed * options.cursorForce);
            d.vx += Math.cos(angle2) * -move;
            d.vy += Math.sin(angle2) * -move;
          }
        } else if (isBulge) {
          d.sx += (d.ax - d.sx) * 0.1;
          d.sy += (d.ay - d.sy) * 0.1;
        }

        if (!isBulge) {
          d.vx *= 0.9;
          d.vy *= 0.9;
          d.x = d.ax + d.vx;
          d.y = d.ay + d.vy;
          d.sx += (d.x - d.sx) * 0.1;
          d.sy += (d.y - d.sy) * 0.1;
        }

        var drawX = d.sx;
        var drawY = d.sy;
        if (options.waveAmplitude > 0) {
          drawY += Math.sin(d.ax * 0.03 + t) * options.waveAmplitude;
          drawX += Math.cos(d.ay * 0.03 + t * 0.7) * options.waveAmplitude * 0.5;
        }

        if (options.sparkle) {
          var hash = ((i * 2654435761) ^ (frameCount >> 3)) >>> 0;
          if (hash % 100 < 3) {
            ctx.moveTo(drawX + rad * 1.8, drawY);
            ctx.arc(drawX, drawY, rad * 1.8, 0, TWO_PI);
          } else {
            ctx.moveTo(drawX + rad, drawY);
            ctx.arc(drawX, drawY, rad, 0, TWO_PI);
          }
        } else {
          ctx.moveTo(drawX + rad, drawY);
          ctx.arc(drawX, drawY, rad, 0, TWO_PI);
        }
      }

      ctx.fill();

      rafId = requestAnimationFrame(tick);
    }

    doResize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onMouseMove, { passive: true });
    rafId = requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
