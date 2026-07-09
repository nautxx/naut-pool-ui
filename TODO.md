# TODO

- [ ] Full redesign of the UI. Current styling is a patched-over PrimeNG
      "vela-blue" theme (custom-ui/html/assets/layout/styles/theme/vela-blue/theme.css)
      with colors hardcoded throughout instead of driven by CSS variables,
      plus a hand-ported DotField background (custom-ui/html/assets/dot-field.js)
      bolted onto a precompiled Angular build with no source. A proper redesign
      should pick a theme/approach that isn't fighting a static, sourceless build.
