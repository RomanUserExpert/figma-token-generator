figma.showUI(__html__, { width: 560, height: 760, title: 'Token Studio' });

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'generate') {
    try {
      const result = await generateTokens(msg.payload);
      figma.ui.postMessage({ type: 'done', result });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
  if (msg.type === 'get-fonts') {
    const fonts = await figma.listAvailableFontsAsync();
    const seen = {};
    const families = [];
    for (var i = 0; i < fonts.length; i++) {
      var fam = fonts[i].fontName.family;
      if (!seen[fam]) { seen[fam] = true; families.push(fam); }
    }
    families.sort();
    figma.ui.postMessage({ type: 'fonts-list', families: families });
  }
  if (msg.type === 'clear-all') {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      for (const c of collections) c.remove();
      const textStyles = await figma.getLocalTextStylesAsync();
      for (const s of textStyles) s.remove();
      const effectStyles = await figma.getLocalEffectStylesAsync();
      for (const s of effectStyles) s.remove();
      figma.ui.postMessage({ type: 'clear-done' });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }
  if (msg.type === 'close') {
    figma.closePlugin();
  }
};

// ── entry point ───────────────────────────────────────────────────────────────

async function generateTokens(payload) {
  var modules = payload.modules || {};
  var moduleConfigs = payload.moduleConfigs || {};
  var colors = payload.colors || {};
  var overwrite = payload.overwrite !== false;
  var totalVars = 0;
  var totalCollections = 0;

  if (modules['Colors']) {
    var cfg = Object.assign({}, moduleConfigs['Colors'] || {}, { overwrite: overwrite });
    var r = await generateColors(colors, cfg);
    totalVars += r.vars;
    totalCollections += r.collections;
  }

  if (modules['Spacing']) {
    var cfg2 = Object.assign({}, moduleConfigs['Spacing'] || {}, { overwrite: overwrite });
    var r2 = await generateSpacing(cfg2);
    totalVars += r2.vars;
    totalCollections += 1;
  }

  if (modules['Border Radius']) {
    var cfg3 = Object.assign({}, moduleConfigs['Border Radius'] || {}, { overwrite: overwrite });
    var r3 = await generateBorderRadius(cfg3);
    totalVars += r3.vars;
    totalCollections += 1;
  }

  if (modules['Typography']) {
    var cfg4 = Object.assign({}, moduleConfigs['Typography'] || {}, { overwrite: overwrite });
    var r4 = await generateTypography(cfg4);
    totalVars += r4.vars + r4.styles;
    if (r4.vars > 0) totalCollections += 1;
  }

  if (modules['Elevation']) {
    var cfg5 = Object.assign({}, moduleConfigs['Elevation'] || {}, { overwrite: overwrite });
    var r5 = await generateElevation(cfg5);
    totalVars += r5.vars + r5.styles;
    if (r5.vars > 0) totalCollections += 1;
  }

  return { collections: totalCollections, variables: totalVars };
}

// ── colors ────────────────────────────────────────────────────────────────────

async function generateColors(colors, cfg) {
  var lightCollName = cfg.collection || 'Primitives';
  var darkCollName  = lightCollName + ' Dark';
  var steps = getShadeSteps(cfg.shadeCount || 'standard', cfg.naming || 'step100');
  var overwrite = cfg.overwrite !== false;
  var darkEnabled = cfg.darkModeOn || false;

  // ── light primitives ──────────────────────────────────────────────────────
  var lightColl = await getOrCreateCollection(lightCollName);
  var lightModeId = lightColl.modes[0].modeId;

  var vars = 0;
  var colorNames = Object.keys(colors);
  var neutralKey = findColorKey(colorNames, 'neutral');

  for (var ci = 0; ci < colorNames.length; ci++) {
    var name = colorNames[ci];
    var hex = colors[name];
    if (!hex || hex.length < 4) continue;
    var isNeutralColor = (name.toLowerCase() === neutralKey);
    var shades = buildLightShades(hex, steps, isNeutralColor);
    for (var si = 0; si < shades.length; si++) {
      var vName = 'color/' + name.toLowerCase() + '/' + shades[si].step;
      var v = await getOrCreateVariable(vName, lightColl, 'COLOR', overwrite);
      applyVar(v, lightModeId, shades[si].rgb, overwrite);
      vars++;
    }
  }

  var collections = 1;

  // ── dark primitives ───────────────────────────────────────────────────────
  var darkColl = null;
  if (darkEnabled) {
    darkColl = await getOrCreateCollection(darkCollName);
    var darkModeId = darkColl.modes[0].modeId;

    for (var ci2 = 0; ci2 < colorNames.length; ci2++) {
      var name2 = colorNames[ci2];
      var hex2 = colors[name2];
      if (!hex2 || hex2.length < 4) continue;
      var isNeutral = (name2.toLowerCase() === neutralKey);
      var darkShades = buildDarkShades(hex2, steps, isNeutral);
      for (var si2 = 0; si2 < darkShades.length; si2++) {
        var vName2 = 'color/' + name2.toLowerCase() + '/' + darkShades[si2].step;
        var v2 = await getOrCreateVariable(vName2, darkColl, 'COLOR', overwrite);
        applyVar(v2, darkModeId, darkShades[si2].rgb, overwrite);
        vars++;
      }
    }

    collections++;
  }

  // ── semantics ─────────────────────────────────────────────────────────────
  if (cfg.semanticOn) {
    var semName = cfg.semanticCollection || 'Semantics';
    var semColl = await getOrCreateCollection(semName);

    if (darkEnabled) {
      if (semColl.modes.length < 2) { semColl.addMode('Dark'); }
      semColl.renameMode(semColl.modes[0].modeId, 'Light');
      semColl.renameMode(semColl.modes[1].modeId, 'Dark');
    } else {
      while (semColl.modes.length > 1) { semColl.removeMode(semColl.modes[1].modeId); }
      semColl.renameMode(semColl.modes[0].modeId, 'Light');
    }
    var semLightId = semColl.modes[0].modeId;
    var semDarkId  = darkEnabled ? semColl.modes[1].modeId : null;

    // Fetch all COLOR vars from both primitive collections for aliasing
    var allColorVars = await figma.variables.getLocalVariablesAsync('COLOR');

    var findVar = function(collectionId, colorName, step) {
      var target = 'color/' + colorName + '/' + step;
      for (var i = 0; i < allColorVars.length; i++) {
        if (allColorVars[i].name === target && allColorVars[i].variableCollectionId === collectionId) {
          return allColorVars[i];
        }
      }
      return null;
    };

    var semTokens = buildSemanticTokens(colorNames, steps);

    for (var ti = 0; ti < semTokens.length; ti++) {
      var t = semTokens[ti];
      var sv = await getOrCreateVariable(t.token, semColl, 'COLOR', overwrite);

      var lightStep = t.lightStep !== undefined ? t.lightStep : t.step;
      var darkStep  = t.darkStep  !== undefined ? t.darkStep  : t.step;

      var lightPrim = findVar(lightColl.id, t.colorName, lightStep);
      if (lightPrim && (!sv.__existed || overwrite)) sv.setValueForMode(semLightId, figma.variables.createVariableAlias(lightPrim));

      if (darkEnabled && semDarkId) {
        var darkPrimColl = darkColl || lightColl;
        var darkPrim = findVar(darkPrimColl.id, t.colorName, darkStep);
        if (darkPrim && (!sv.__existed || overwrite)) sv.setValueForMode(semDarkId, figma.variables.createVariableAlias(darkPrim));
      }

      vars++;
    }

    collections++;
  }

  return { vars: vars, collections: collections };
}

// Same step for both light and dark — the primitive collections hold different values
function buildSemanticTokens(colorNames, steps) {
  var lower = colorNames.map(function(n) { return n.toLowerCase(); });
  var neutral = findColorKey(colorNames, 'neutral');
  var brand   = findColorKey(colorNames, 'brand');
  var last = steps.length - 1;

  var tokens = [];
  // p is 0.0 (lightest) → 1.0 (darkest), maps proportionally to steps array
  function pct(p) { return steps[Math.min(last, Math.max(0, Math.round(p * last)))]; }
  function add(token, colorName, p) {
    tokens.push({ token: token, colorName: colorName, step: pct(p) });
  }
  function addLD(token, colorName, lp, dp) {
    tokens.push({ token: token, colorName: colorName, lightStep: pct(lp), darkStep: pct(dp) });
  }

  // Background  (0 = lightest end, 1 = darkest end)
  add('bg/primary',   neutral, 0.00);
  add('bg/inversed',  neutral, 1.00);

  // Surface
  add('surface/primary',      neutral, 0.11);
  add('surface/secondary',    neutral, 0.22);
  add('surface/tertiary',     neutral, 0.33);
  add('surface/inversed',     neutral, 0.89);
  add('surface/brand/subtle', brand,   0.00);
  add('surface/brand/strong', brand,   0.33);

  // Text
  add('text/primary',   neutral, 0.89);
  add('text/secondary', neutral, 0.56);
  add('text/tertiary',  neutral, 0.28);
  add('text/inversed',  neutral, 0.00);
  add('text/brand',     brand,   0.56);

  // Icon
  add('icon/primary',   neutral, 0.89);
  add('icon/secondary', neutral, 0.56);
  add('icon/tertiary',  neutral, 0.28);
  add('icon/inversed',  neutral, 0.00);
  add('icon/brand',     brand,   0.56);

  // Border
  add('border/primary',      neutral, 0.39);
  add('border/secondary',    neutral, 0.28);
  add('border/tertiary',     neutral, 0.17);
  add('border/inversed',     neutral, 0.89);
  add('border/brand/subtle', brand,   0.22);
  add('border/brand/strong', brand,   0.50);
  add('border/focus',        brand,   0.50);

  // Actions — primary
  add('action/primary/default',  brand,   0.44);
  add('action/primary/hover',    brand,   0.56);
  add('action/primary/pressed',  brand,   0.67);
  add('action/primary/focused',  brand,   0.44);
  add('action/primary/disabled', neutral, 0.28);

  // Actions — secondary (outlined / tinted)
  add('action/secondary/default',  brand,   0.11);
  add('action/secondary/hover',    brand,   0.22);
  add('action/secondary/pressed',  brand,   0.33);
  add('action/secondary/focused',  brand,   0.11);
  add('action/secondary/disabled', neutral, 0.22);

  // Actions — tertiary (ghost / subtle)
  add('action/tertiary/default',  neutral, 0.11);
  add('action/tertiary/hover',    neutral, 0.22);
  add('action/tertiary/pressed',  neutral, 0.33);
  add('action/tertiary/focused',  neutral, 0.11);
  add('action/tertiary/disabled', neutral, 0.11);

  // On-color text/icon for colored surfaces
  addLD('text/on-color', neutral, 0.00, 1.00);
  addLD('icon/on-color', neutral, 0.00, 1.00);

  // Status surface / text / icon / border + action states
  var statuses = ['info', 'success', 'warning', 'error'];
  for (var i = 0; i < statuses.length; i++) {
    var status = statuses[i];
    if (lower.indexOf(status) === -1) continue;

    add('surface/' + status + '/subtle', status, 0.00);
    add('surface/' + status + '/strong', status, 0.33);
    add('text/'    + status, status, 0.56);
    add('icon/'    + status, status, 0.56);
    add('border/'  + status + '/subtle', status, 0.22);
    add('border/'  + status + '/strong', status, 0.50);

    add('action/' + status + '/default',  status, 0.44);
    add('action/' + status + '/hover',    status, 0.56);
    add('action/' + status + '/pressed',  status, 0.67);
    add('action/' + status + '/focused',  status, 0.44);
  }

  return tokens;
}

// ── spacing ───────────────────────────────────────────────────────────────────

async function generateSpacing(cfg) {
  var collectionName = cfg.collection || 'Spacing';
  var base = parseInt(cfg.base || '4');
  var qty = cfg.qty || 'standard';
  var count = qty === 'compact' ? 8 : qty === 'system' ? 16 : 12;
  var naming = cfg.naming || 'size';
  var prefix = cfg.prefix || 'sp';
  var overwrite = cfg.overwrite !== false;

  var collection = await getOrCreateCollection(collectionName);
  var modeId = collection.modes[0].modeId;

  var vars = 0;
  for (var i = 1; i <= count; i++) {
    var value = base * i;
    var tokenName = naming === 'number'
      ? 'spacing/' + prefix + '-' + value
      : 'spacing/' + prefix + '-' + i;
    var v = await getOrCreateVariable(tokenName, collection, 'FLOAT', overwrite);
    applyVar(v, modeId, value, overwrite);
    vars++;
  }

  return { vars: vars };
}

// ── border radius ─────────────────────────────────────────────────────────────

async function generateBorderRadius(cfg) {
  var collectionName = cfg.collection || 'Border Radius';
  var prefix = cfg.prefix || 'rd';
  var base = parseInt(cfg.base || '4');
  var qty = cfg.qty || 'standard';
  var count = qty === 'compact' ? 4 : qty === 'system' ? 8 : 6;
  var naming = cfg.naming || 'size';
  var includeFull = cfg.full !== false;
  var overwrite = cfg.overwrite !== false;

  var collection = await getOrCreateCollection(collectionName);
  var modeId = collection.modes[0].modeId;

  var vars = 0;
  for (var i = 0; i < count; i++) {
    var value = i === 0 ? 0 : base * i;
    var name = naming === 'number' ? ('' + value) : ('' + (i + 1));
    var v = await getOrCreateVariable('radius/' + prefix + '-' + name, collection, 'FLOAT', overwrite);
    applyVar(v, modeId, value, overwrite);
    vars++;
  }
  if (includeFull) {
    var vf = await getOrCreateVariable('radius/' + prefix + '-full', collection, 'FLOAT', overwrite);
    applyVar(vf, modeId, 9999, overwrite);
    vars++;
  }

  return { vars: vars };
}

// ── typography ────────────────────────────────────────────────────────────────

async function generateTypography(cfg) {
  if (cfg.generateStyles === false && cfg.generateVars === false) return { vars: 0, styles: 0 };

  var fonts    = cfg.fonts || [
    { name: 'Geist', ratio: 'minor-third', uses: { Heading: true, Title: true } },
    { name: 'Inter', ratio: 'minor-third', uses: { Body: true, Label: true, Caption: true, Button: true, Link: true } },
  ];
  var preset   = cfg.size || 'standard';
  var overwrite = cfg.overwrite !== false;
  var doVars   = cfg.generateVars   !== false;
  var doStyles = cfg.generateStyles !== false;

  var sizeMaps = {
    compact: {
      Heading: [['H1',40],['H2',32],['H3',28],['H4',24],['H5',20],['H6',18]],
      Title:   [['L',20],['M',18],['S',16]],
      Body:    [['L',16],['M',14],['S',13]],
      Label:   [['L',14],['M',13],['S',12]],
      Caption: [['L',13],['M',12],['S',11]],
      Button:  [['L',16],['M',14],['S',13]],
      Link:    [['L',16],['M',14],['S',13]],
    },
    standard: {
      Heading: [['H1',48],['H2',40],['H3',32],['H4',28],['H5',24],['H6',20]],
      Title:   [['L',24],['M',20],['S',18]],
      Body:    [['L',18],['M',16],['S',14]],
      Label:   [['L',16],['M',14],['S',12]],
      Caption: [['L',14],['M',12],['S',11]],
      Button:  [['L',18],['M',16],['S',14]],
      Link:    [['L',18],['M',16],['S',14]],
    },
    large: {
      Heading: [['H1',72],['H2',56],['H3',48],['H4',40],['H5',32],['H6',24]],
      Title:   [['L',32],['M',28],['S',24]],
      Body:    [['L',20],['M',18],['S',16]],
      Label:   [['L',18],['M',16],['S',14]],
      Caption: [['L',16],['M',14],['S',12]],
      Button:  [['L',20],['M',18],['S',16]],
      Link:    [['L',20],['M',18],['S',16]],
    },
  };

  var weightFor     = { Heading:'Semi Bold', Title:'Semi Bold', Body:'Regular', Label:'Medium', Caption:'Regular', Button:'Medium', Link:'Regular' };
  var lineHeightFor = { Heading:120, Title:130, Body:150, Label:140, Caption:140, Button:150, Link:150 };

  var sizes = sizeMaps[preset] || sizeMaps.standard;

  var RATIO_VALUES = {
    'minor-second': 1.067, 'major-second': 1.125,
    'minor-third':  1.200, 'major-third':  1.250, 'perfect-fourth': 1.333,
  };
  var REF_RATIO = 1.200; // sizeMaps are calibrated for minor-third

  // Returns a scaled copy of a size list based on the font's ratio.
  // Heading/Title get the full ratio effect; Body/Label/Caption get sqrt (mild shift).
  function applyRatio(slist, cat, ratioKey) {
    var r = RATIO_VALUES[ratioKey] || REF_RATIO;
    var scale = (cat === 'Heading' || cat === 'Title') ? r / REF_RATIO : Math.sqrt(r / REF_RATIO);
    if (Math.abs(scale - 1) < 0.001) return slist;
    return slist.map(function(pair) { return [pair[0], Math.round(pair[1] * scale)]; });
  }

  var typoColl   = doVars ? await getOrCreateCollection('Typography') : null;
  var typoModeId = typoColl ? typoColl.modes[0].modeId : null;
  var existingStyles = doStyles ? await figma.getLocalTextStylesAsync() : [];
  var totalVars = 0;
  var totalStyles = 0;

  // Single shared letter-spacing variable — always 0
  var lsVar = null;
  if (doVars) {
    lsVar = await getOrCreateVariable('letter-spacing/none', typoColl, 'FLOAT', overwrite);
    applyVar(lsVar, typoModeId, 0, overwrite);
    totalVars++;
  }

  // Pre-load every font already used by existing text styles so we can modify them
  if (doStyles) {
    var seenFonts = {};
    for (var xi = 0; xi < existingStyles.length; xi++) {
      var xf = existingStyles[xi].fontName;
      if (xf && xf.family) {
        var fkey = xf.family + '|' + xf.style;
        if (!seenFonts[fkey]) {
          seenFonts[fkey] = true;
          try { await figma.loadFontAsync(xf); } catch (e) {}
        }
      }
    }
  }

  for (var fi = 0; fi < fonts.length; fi++) {
    var font   = fonts[fi];
    var family = font.name || 'Inter';
    var uses   = font.uses || {};
    var cats   = Object.keys(uses).filter(function(k) { return uses[k] && sizes[k]; });

    // Pre-load every weight this family will need so existing styles can be modified
    if (doStyles) {
      var allWeights = ['Regular', 'Medium', 'Semi Bold'];
      for (var wi = 0; wi < allWeights.length; wi++) {
        try { await figma.loadFontAsync({ family: family, style: allWeights[wi] }); } catch (e) {}
      }
    }

    for (var ki = 0; ki < cats.length; ki++) {
      var cat    = cats[ki];
      var weight = weightFor[cat] || 'Regular';
      var lhPct  = lineHeightFor[cat] || 140;

      // per-category variables
      var ffVar = null;
      if (doVars) {
        ffVar = await getOrCreateVariable('font-family/' + cat, typoColl, 'STRING', overwrite);
        applyVar(ffVar, typoModeId, family, overwrite);
        totalVars++;

        var wNum = weight === 'Semi Bold' ? 600 : weight === 'Medium' ? 500 : 400;
        var fwVar = await getOrCreateVariable('font-weight/' + cat, typoColl, 'FLOAT', overwrite);
        applyVar(fwVar, typoModeId, wNum, overwrite);
        totalVars++;
      }

      // load font once per category
      if (doStyles) {
        try {
          await figma.loadFontAsync({ family: family, style: weight });
        } catch (e) {
          try {
            await figma.loadFontAsync({ family: family, style: 'Regular' });
            weight = 'Regular';
          } catch (e2) { continue; }
        }
      }

      var slist = applyRatio(sizes[cat], cat, font.ratio);
      for (var si = 0; si < slist.length; si++) {
        var sName     = slist[si][0];
        var px        = slist[si][1];
        var base      = cat + '/' + sName;
        var styleName = cat + '/' + sName;

        // per-size variables
        var fsVar = null;
        var lhVar = null;
        if (doVars) {
          fsVar = await getOrCreateVariable('font-size/' + base, typoColl, 'FLOAT', overwrite);
          applyVar(fsVar, typoModeId, px, overwrite);
          totalVars++;

          lhVar = await getOrCreateVariable('line-height/' + base, typoColl, 'FLOAT', overwrite);
          applyVar(lhVar, typoModeId, Math.round(px * lhPct / 100), overwrite);
          totalVars++;
        }

        // create / update text style
        if (doStyles) {
          var style = null;
          for (var ei = 0; ei < existingStyles.length; ei++) {
            if (existingStyles[ei].name === styleName) { style = existingStyles[ei]; break; }
          }
          if (!style) style = figma.createTextStyle();
          if (style.fontName) {
            try { await figma.loadFontAsync(style.fontName); } catch (e) {}
          }
          totalStyles++;

          style.name           = styleName;
          style.fontSize       = px;
          style.lineHeight     = { value: lhPct, unit: 'PERCENT' };
          style.letterSpacing  = { value: 0, unit: 'PERCENT' };
          style.textDecoration = cat === 'Link' ? 'UNDERLINE' : 'NONE';

          try { style.fontName = { family: family, style: weight }; }
          catch (e) { style.fontName = { family: family, style: 'Regular' }; }

          // bind variables to the style
          if (doVars) {
            try { style.setBoundVariable('fontFamily',    ffVar); } catch (e) {}
            try { style.setBoundVariable('fontSize',      fsVar); } catch (e) {}
            try { style.setBoundVariable('lineHeight',    lhVar); } catch (e) {}
            try { style.setBoundVariable('letterSpacing', lsVar); } catch (e) {}
            try { style.setBoundVariable('fontWeight',    fwVar); } catch (e) {}
          }
        }
      }
    }
  }

  return { vars: totalVars, styles: totalStyles };
}

// ── elevation ────────────────────────────────────────────────────────────────

async function generateElevation(cfg) {
  var preset          = cfg.preset      || 'soft';
  var collectionName  = cfg.collection  || 'Elevation';
  var prefix          = cfg.prefix      || 'shadow';
  var overwrite       = cfg.overwrite   !== false;

  var PRESETS = {
    soft: [
      { name: 'none', effects: [] },
      { name: 'xs', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.06 }, offset: { x:0, y:1 }, radius: 3,  spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'sm', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.04 }, offset: { x:0, y:1 }, radius: 2,  spread: 0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.08 }, offset: { x:0, y:2 }, radius: 8,  spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'md', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.06 }, offset: { x:0, y:2 }, radius: 4,  spread: 0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.10 }, offset: { x:0, y:4 }, radius: 16, spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'lg', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.08 }, offset: { x:0, y:4 }, radius: 8,  spread: 0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.12 }, offset: { x:0, y:8 }, radius: 24, spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'xl', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.10 }, offset: { x:0, y:8  }, radius: 16, spread: 0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.14 }, offset: { x:0, y:16 }, radius: 48, spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
    ],
    material: [
      { name: 'none', effects: [] },
      { name: 'xs', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.10 }, offset: { x:0, y:1 }, radius: 2, spread:  0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.06 }, offset: { x:0, y:1 }, radius: 4, spread:  0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'sm', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.12 }, offset: { x:0, y:2 }, radius: 4,  spread:  0, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.08 }, offset: { x:0, y:2 }, radius: 8,  spread:  0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'md', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.15 }, offset: { x:0, y:4 }, radius: 8,  spread: -2, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.10 }, offset: { x:0, y:4 }, radius: 16, spread:  0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'lg', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.18 }, offset: { x:0, y:8  }, radius: 16, spread: -4, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.12 }, offset: { x:0, y:8  }, radius: 24, spread:  0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'xl', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.22 }, offset: { x:0, y:16 }, radius: 32, spread: -8, visible: true, blendMode: 'NORMAL' },
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.14 }, offset: { x:0, y:16 }, radius: 48, spread:  0, visible: true, blendMode: 'NORMAL' },
      ]},
    ],
    sharp: [
      { name: 'none', effects: [] },
      { name: 'xs', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.20 }, offset: { x:0, y:1 }, radius: 2,  spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'sm', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.25 }, offset: { x:0, y:2 }, radius: 4,  spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'md', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.30 }, offset: { x:1, y:4 }, radius: 8,  spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'lg', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.35 }, offset: { x:2, y:8 }, radius: 12, spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
      { name: 'xl', effects: [
        { type: 'DROP_SHADOW', color: { r:0, g:0, b:0, a:0.40 }, offset: { x:4, y:16 }, radius: 24, spread: 0, visible: true, blendMode: 'NORMAL' },
      ]},
    ],
  };

  var levels = PRESETS[preset] || PRESETS.soft;

  var elevColl   = await getOrCreateCollection(collectionName);
  var elevModeId = elevColl.modes[0].modeId;
  var existingStyles = await figma.getLocalEffectStylesAsync();
  var totalVars = 0;

  for (var i = 0; i < levels.length; i++) {
    var lvl = levels[i];
    var styleName = collectionName + '/' + lvl.name;
    var multi = lvl.effects.length > 1;

    // Create variables for each shadow layer in this level
    var layerVars = [];
    for (var si = 0; si < lvl.effects.length; si++) {
      var eff = lvl.effects[si];
      var sfx = multi ? '-' + (si + 1) : '';
      var base = prefix + '/' + lvl.name;

      var blurVar = await getOrCreateVariable(base + '/blur' + sfx,    elevColl, 'FLOAT', overwrite);
      applyVar(blurVar, elevModeId, eff.radius, overwrite);

      var yVar = await getOrCreateVariable(base + '/y' + sfx,          elevColl, 'FLOAT', overwrite);
      applyVar(yVar, elevModeId, eff.offset.y, overwrite);

      var xVar = await getOrCreateVariable(base + '/x' + sfx,          elevColl, 'FLOAT', overwrite);
      applyVar(xVar, elevModeId, eff.offset.x, overwrite);

      var spreadVar = await getOrCreateVariable(base + '/spread' + sfx, elevColl, 'FLOAT', overwrite);
      applyVar(spreadVar, elevModeId, eff.spread, overwrite);

      var colorVar = await getOrCreateVariable(base + '/color' + sfx,   elevColl, 'COLOR', overwrite);
      applyVar(colorVar, elevModeId, eff.color, overwrite);

      totalVars += 5;
      layerVars.push({ blurVar: blurVar, xVar: xVar, yVar: yVar, spreadVar: spreadVar, colorVar: colorVar });
    }

    // Build effects array with variables embedded inline (same pattern as fills)
    var boundEffects = [];
    for (var bi = 0; bi < lvl.effects.length; bi++) {
      var srcEff = lvl.effects[bi];
      var lv     = layerVars[bi];
      boundEffects.push({
        type:      srcEff.type,
        color:     srcEff.color,
        offset:    srcEff.offset,
        radius:    srcEff.radius,
        spread:    srcEff.spread,
        visible:   srcEff.visible,
        blendMode: srcEff.blendMode,
        boundVariables: {
          radius:  figma.variables.createVariableAlias(lv.blurVar),
          offsetX: figma.variables.createVariableAlias(lv.xVar),
          offsetY: figma.variables.createVariableAlias(lv.yVar),
          spread:  figma.variables.createVariableAlias(lv.spreadVar),
          color:   figma.variables.createVariableAlias(lv.colorVar),
        }
      });
    }

    // Create / update effect style
    var style = null;
    for (var ei = 0; ei < existingStyles.length; ei++) {
      if (existingStyles[ei].name === styleName) { style = existingStyles[ei]; break; }
    }
    if (!style) style = figma.createEffectStyle();
    if (!style.name || overwrite) {
      style.name    = styleName;
      style.effects = boundEffects.length > 0 ? boundEffects : [];
    }
  }

  return { vars: totalVars, styles: levels.length };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getShadeSteps(shadeCount, naming) {
  var count = shadeCount === 'compact' ? 8 : shadeCount === 'system' ? 11 : 10;
  var step  = naming === 'step1' ? 1 : naming === 'step50' ? 50 : 100;
  var steps = [];
  for (var i = 1; i <= count; i++) steps.push(i * step);
  return steps;
}

// ── Ant Design palette algorithm ──────────────────────────────────────────────

// Per-step adjustments (from @ant-design/colors source)
var ANT_HUE_STEP  = 2;     // degrees of hue rotation per step
var ANT_SAT_LIGHT = 0.20;  // saturation decrease per lighter step (higher = lighter/airier light shades)
var ANT_VAL_LIGHT = 0.08;  // brightness increase per lighter step (higher = lighter light shades)
var ANT_SAT_DARK  = 0.05;  // saturation increase per darker step
var ANT_VAL_DARK  = 0.12;  // brightness decrease per darker step (lower = less extreme dark shades)

// Dark theme: for each of 10 positions (0=darkest, 9=lightest),
// which light palette step index to sample and at what blend % over #141414
var ANT_DARK_SRC    = [7, 6, 5, 5, 5, 5, 4, 3, 2, 1];
var ANT_DARK_AMOUNT = [0.42, 0.52, 0.62, 0.74, 0.86, 0.94, 0.97, 0.99, 0.99, 1.00];

function antInterp(arr, t) {
  var pos = t * (arr.length - 1);
  var lo = Math.floor(pos);
  var hi = Math.min(arr.length - 1, lo + 1);
  return arr[lo] * (1 - (pos - lo)) + arr[hi] * (pos - lo);
}

// Light palette — HSV with ±2° hue rotation and Ant Design sat/val steps.
// isNeutral: force shade 50 to pure white (no hue tint for gray scales).
function buildLightShades(hex, steps, isNeutral) {
  var rgb = hexToRgbArray(hex);
  var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  var baseH = hsv.h, baseS = hsv.s, baseV = hsv.v;
  var n = steps.length;

  var baseIdx = steps.indexOf(500);
  if (baseIdx === -1) baseIdx = Math.floor(n / 2);

  // Neutral: linear V ramp anchored at shade 500, saturation scaled by a power curve
  // so lighter shades are nearly white/gray while deeper shades carry the user's hue.
  if (isNeutral) {
    return steps.map(function(step, i) {
      if (i === 0) return { step: step, rgb: { r: 0.99, g: 0.99, b: 0.99 } };
      var v, s;
      if (i <= baseIdx) {
        var t = i / baseIdx;
        v = 1.0 + (baseV - 1.0) * Math.pow(t, 2); // eases in — keeps early shades light
        s = baseS * Math.pow(t, 1.5); // near-zero at light end, full baseS at 500
      } else {
        var t2 = (i - baseIdx) / (n - 1 - baseIdx);
        v = baseV + (0.13 - baseV) * t2;
        s = baseS; // keep full saturation in the dark half
      }
      var out = hsvToRgb(baseH, Math.max(0, Math.min(1, s)), Math.max(0, Math.min(1, v)));
      return { step: step, rgb: { r: out.r / 255, g: out.g / 255, b: out.b / 255 } };
    });
  }

  // Cool hues (60–240°) rotate counter-clockwise toward lighter; warm rotate clockwise
  var hueDir = (baseH >= 60 && baseH <= 240) ? -1 : 1;

  return steps.map(function(step, i) {
    var outH, outS, outV;

    if (i === baseIdx) {
      outH = baseH; outS = baseS; outV = baseV;
    } else if (i < baseIdx) {
      var d = baseIdx - i;
      outH = (baseH + hueDir * ANT_HUE_STEP * d + 360) % 360;
      outS = Math.max(0.06, baseS - ANT_SAT_LIGHT * d);
      if (i === 0) outS = Math.min(outS, 0.06);
      outV = Math.min(1.0, baseV + ANT_VAL_LIGHT * d);
    } else {
      var d2 = i - baseIdx;
      outH = (baseH - hueDir * ANT_HUE_STEP * d2 + 360) % 360;
      outS = Math.min(1.0, baseS + ANT_SAT_DARK * d2);
      outV = Math.max(0, baseV - ANT_VAL_DARK * d2);
    }

    var out = hsvToRgb(outH, Math.max(0, Math.min(1, outS)), Math.max(0, Math.min(1, outV)));
    return { step: step, rgb: { r: out.r / 255, g: out.g / 255, b: out.b / 255 } };
  });
}

// Dark palette — blend light palette shades over #141414 at varying opacities.
// Matches the Ant Design dark theme pattern for non-neutral colors.
// Neutral: pure grayscale ramp from near-black to near-white.
function buildDarkShades(hex, steps, isNeutral) {
  var n = steps.length;

  if (isNeutral) {
    return steps.map(function(step, i) {
      var t = i / (n - 1);
      var v = Math.round((0.04 + t * 0.84) * 255);
      return { step: step, rgb: { r: v / 255, g: v / 255, b: v / 255 } };
    });
  }

  var lightShades = buildLightShades(hex, steps, false);
  var bgR = 20, bgG = 20, bgB = 20; // #141414

  return steps.map(function(step, i) {
    var t = i / Math.max(1, n - 1); // 0 = darkest, 1 = lightest

    var srcFrac    = antInterp(ANT_DARK_SRC, t);
    var blendAmt   = antInterp(ANT_DARK_AMOUNT, t);
    var srcIdx     = Math.max(0, Math.min(n - 1, Math.round(srcFrac / 9 * (n - 1))));

    var src = lightShades[srcIdx].rgb;
    var cr = clamp(Math.round((1 - blendAmt) * bgR + blendAmt * src.r * 255));
    var cg = clamp(Math.round((1 - blendAmt) * bgG + blendAmt * src.g * 255));
    var cb = clamp(Math.round((1 - blendAmt) * bgB + blendAmt * src.b * 255));
    return { step: step, rgb: { r: cr / 255, g: cg / 255, b: cb / 255 } };
  });
}

function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  var h, s = max === 0 ? 0 : d / max, v = max;
  if (d === 0) {
    h = 0;
  } else if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    h = ((b - r) / d + 2) / 6;
  } else {
    h = ((r - g) / d + 4) / 6;
  }
  return { h: h * 360, s: s, v: v };
}

function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  var sector = Math.floor(h / 60);
  var f = h / 60 - sector;
  var p = v * (1 - s);
  var q = v * (1 - f * s);
  var t = v * (1 - (1 - f) * s);
  var r, g, b;
  switch (sector) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return { r: clamp(Math.round(r * 255)), g: clamp(Math.round(g * 255)), b: clamp(Math.round(b * 255)) };
}

// Returns the matching color key from the color list, or falls back to first key
function findColorKey(colorNames, preferred) {
  var lower = colorNames.map(function(n) { return n.toLowerCase(); });
  if (lower.indexOf(preferred) !== -1) return preferred;
  return colorNames.length > 0 ? colorNames[0].toLowerCase() : preferred;
}

async function getOrCreateCollection(name) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === name) return collections[i];
  }
  return figma.variables.createVariableCollection(name);
}

async function getOrCreateVariable(name, collection, type, overwrite) {
  var all = await figma.variables.getLocalVariablesAsync(type);
  for (var i = 0; i < all.length; i++) {
    if (all[i].name === name && all[i].variableCollectionId === collection.id) {
      all[i].__existed = true;
      return all[i];
    }
  }
  var v = figma.variables.createVariable(name, collection, type);
  v.__existed = false;
  return v;
}

function applyVar(v, modeId, value, overwrite) {
  if (!v.__existed || overwrite) v.setValueForMode(modeId, value);
}

function hexToRgbArray(hex) {
  var v = hex.replace('#', '');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }
