figma.showUI(__html__, { width: 560, height: 760, title: 'UI Token Starter Pack' });

// Read saved config from clientStorage and seed the UI
(async function() {
  try {
    var savedPageName = await figma.clientStorage.getAsync('stylesheetPageName');
    var savedColorsConfig = null;
    try { savedColorsConfig = await figma.clientStorage.getAsync('lastColorsConfig'); } catch(e2) {}
    figma.ui.postMessage({ type: 'stylesheet-init', pageName: savedPageName || 'Token Stylesheet', colorsConfig: savedColorsConfig || null });
  } catch(e) {
    figma.ui.postMessage({ type: 'stylesheet-init', pageName: 'Token Stylesheet' });
  }
})();

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'check-plan') {
    var probe = null;
    try {
      probe = figma.variables.createVariableCollection('__plan_probe__');
      probe.addMode('__test__');
      probe.remove();
      figma.ui.postMessage({ type: 'plan-check', supportsMultiMode: true });
    } catch (e) {
      if (probe) { try { probe.remove(); } catch (e2) {} }
      figma.ui.postMessage({ type: 'plan-check', supportsMultiMode: false });
    }
  }
  if (msg.type === 'generate') {
    try {
      const result = await generateTokens(msg.payload);
      try {
        var colorsCfgToSave = (msg.payload.moduleConfigs || {})['Colors'];
        if (colorsCfgToSave) await figma.clientStorage.setAsync('lastColorsConfig', colorsCfgToSave);
      } catch(se) {}
      figma.ui.postMessage({ type: 'done', result });
    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message + '\n' + (err.stack || '') });
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
  if (msg.type === 'update-stylesheet') {
    try {
      var ssCache = {
        collections:  (await figma.variables.getLocalVariableCollectionsAsync()) || [],
        vars: {
          'COLOR':  (await figma.variables.getLocalVariablesAsync('COLOR'))  || [],
          'FLOAT':  (await figma.variables.getLocalVariablesAsync('FLOAT'))  || [],
          'STRING': (await figma.variables.getLocalVariablesAsync('STRING')) || [],
        },
        textStyles:   (await figma.getLocalTextStylesAsync())   || [],
        effectStyles: (await figma.getLocalEffectStylesAsync()) || [],
      };
      await generateStylesheet(msg.modules, msg.moduleConfigs, ssCache, {
        pageName:       msg.pageName,
        useCurrentPage: msg.useCurrentPage,
      });
      figma.ui.postMessage({ type: 'stylesheet-updated' });
    } catch (err) {
      figma.ui.postMessage({ type: 'stylesheet-error', message: err.message + '\n' + (err.stack || '') });
    }
  }
  if (msg.type === 'clear-all') {
    try {
      const collections = await figma.variables.getLocalVariableCollectionsAsync();
      for (const c of collections) c.remove();
      const textStyles = await figma.getLocalTextStylesAsync();
      for (const s of textStyles) s.remove();
      const effectStyles = await figma.getLocalEffectStylesAsync();
      for (const s of effectStyles) s.remove();
      // Remove the stylesheet page — find by pluginData first, name as legacy fallback
      try {
        var _sp = figma.root.children;
        for (var pi = 0; pi < _sp.length; pi++) {
          var isSheet = false;
          try { isSheet = _sp[pi].getPluginData('isTokenStylesheet') === 'true'; } catch(e) {}
          if (!isSheet) isSheet = _sp[pi].name === 'Token Stylesheet';
          if (isSheet) {
            if (figma.root.children.length > 1) _sp[pi].remove();
            break;
          }
        }
      } catch (pe) {}
      try { await figma.clientStorage.removeAsync('lastColorsConfig'); } catch(ce) {}
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

  // Fetch everything once upfront. getOrCreate* functions read/write this cache
  // in-memory, so no further API round-trips happen during generation.
  var cache = {
    collections:  (await figma.variables.getLocalVariableCollectionsAsync()) || [],
    vars: {
      'COLOR':  (await figma.variables.getLocalVariablesAsync('COLOR'))  || [],
      'FLOAT':  (await figma.variables.getLocalVariablesAsync('FLOAT'))  || [],
      'STRING': (await figma.variables.getLocalVariablesAsync('STRING')) || [],
    },
    textStyles:   (await figma.getLocalTextStylesAsync())   || [],
    effectStyles: (await figma.getLocalEffectStylesAsync()) || [],
  };

  if (modules['Colors']) {
    try {
      var cfg = Object.assign({}, moduleConfigs['Colors'] || {}, { overwrite: overwrite });
      var r = await generateColors(colors, cfg, cache);
      totalVars += r.vars;
      totalCollections += r.collections;
    } catch (e) { e.message = '[Colors] ' + e.message; throw e; }
  }

  if (modules['Spacing']) {
    try {
      var cfg2 = Object.assign({}, moduleConfigs['Spacing'] || {}, { overwrite: overwrite });
      var r2 = await generateSpacing(cfg2, cache);
      totalVars += r2.vars;
      totalCollections += 1;
    } catch (e) { e.message = '[Spacing] ' + e.message; throw e; }
  }

  if (modules['Border Radius']) {
    try {
      var cfg3 = Object.assign({}, moduleConfigs['Border Radius'] || {}, { overwrite: overwrite });
      var r3 = await generateBorderRadius(cfg3, cache);
      totalVars += r3.vars;
      totalCollections += 1;
    } catch (e) { e.message = '[Border Radius] ' + e.message; throw e; }
  }

  if (modules['Typography']) {
    try {
      var cfg4 = Object.assign({}, moduleConfigs['Typography'] || {}, { overwrite: overwrite });
      var r4 = await generateTypography(cfg4, cache);
      totalVars += r4.vars + r4.styles;
      if (r4.vars > 0) totalCollections += 1;
    } catch (e) { e.message = '[Typography] ' + e.message; throw e; }
  }

  if (modules['Elevation']) {
    try {
      var cfg5 = Object.assign({}, moduleConfigs['Elevation'] || {}, { overwrite: overwrite });
      var r5 = await generateElevation(cfg5, cache);
      totalVars += r5.vars + r5.styles;
      if (r5.vars > 0) totalCollections += 1;
    } catch (e) { e.message = '[Elevation] ' + e.message; throw e; }
  }

  if (payload.stylesheet) {
    try {
      var ssCfg = moduleConfigs['Stylesheet'] || {};
      await generateStylesheet(modules, moduleConfigs, cache, {
        pageName:       ssCfg.pageName,
        useCurrentPage: ssCfg.useCurrentPage,
      });
    } catch (e) { e.message = '[Stylesheet] ' + e.message; throw e; }
  }

  return { collections: totalCollections, variables: totalVars };
}

// ── colors ────────────────────────────────────────────────────────────────────

async function generateColors(colors, cfg, cache) {
  var lightCollName = cfg.collection || 'Primitives';
  var darkCollName  = lightCollName + ' Dark';
  var steps = getShadeSteps(cfg.shadeCount || 'standard', cfg.naming || 'step100');
  var overwrite = cfg.overwrite !== false;
  var darkEnabled = cfg.darkModeOn || false;
  var freePlanFallback = false; // true if addMode('Dark') fails on Figma free plan

  // ── light primitives ──────────────────────────────────────────────────────
  var lightColl = getOrCreateCollection(lightCollName, cache);
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
      var v = getOrCreateVariable(vName, lightColl, 'COLOR', overwrite, cache);
      applyVar(v, lightModeId, shades[si].rgb, overwrite);
      vars++;
    }
  }

  // transparent primitive — single anchor for all ghost/default semantic aliases
  var transpVar = getOrCreateVariable('color/transparent', lightColl, 'COLOR', overwrite, cache);
  applyVar(transpVar, lightModeId, { r: 0, g: 0, b: 0, a: 0 }, overwrite);
  vars++;

  var collections = 1;

  // ── dark primitives ───────────────────────────────────────────────────────
  var darkColl = null;
  if (darkEnabled) {
    darkColl = getOrCreateCollection(darkCollName, cache);
    var darkModeId = darkColl.modes[0].modeId;

    for (var ci2 = 0; ci2 < colorNames.length; ci2++) {
      var name2 = colorNames[ci2];
      var hex2 = colors[name2];
      if (!hex2 || hex2.length < 4) continue;
      var isNeutral = (name2.toLowerCase() === neutralKey);
      var darkShades = buildDarkShades(hex2, steps, isNeutral);
      for (var si2 = 0; si2 < darkShades.length; si2++) {
        var vName2 = 'color/' + name2.toLowerCase() + '/' + darkShades[si2].step;
        var v2 = getOrCreateVariable(vName2, darkColl, 'COLOR', overwrite, cache);
        applyVar(v2, darkModeId, darkShades[si2].rgb, overwrite);
        vars++;
      }
    }

    collections++;
  }

  // ── semantics ─────────────────────────────────────────────────────────────
  if (cfg.semanticOn) {
    var semName = cfg.semanticCollection || 'Semantics';
    var semColl = getOrCreateCollection(semName, cache);
    var semDarkColl = null;

    if (darkEnabled) {
      if (semColl.modes.length < 2) {
        try {
          semColl.addMode('Dark');
        } catch (planErr) {
          freePlanFallback = true;
        }
      }
      if (!freePlanFallback && semColl.modes.length >= 2) {
        semColl.renameMode(semColl.modes[0].modeId, 'Light');
        semColl.renameMode(semColl.modes[1].modeId, 'Dark');
      } else {
        // Free plan: keep Semantics as Light-only, mirror dark values into a separate collection
        freePlanFallback = true;
        semColl.renameMode(semColl.modes[0].modeId, 'Light');
        semDarkColl = getOrCreateCollection(semName + ' Dark', cache);
        semDarkColl.renameMode(semDarkColl.modes[0].modeId, 'Dark');
        collections++;
      }
    } else {
      while (semColl.modes.length > 1) { semColl.removeMode(semColl.modes[1].modeId); }
      semColl.renameMode(semColl.modes[0].modeId, 'Light');
    }
    var semLightId = semColl.modes[0].modeId;
    var semDarkId  = (!freePlanFallback && darkEnabled) ? semColl.modes[1].modeId : null;
    var semDarkCollModeId = (freePlanFallback && semDarkColl) ? semDarkColl.modes[0].modeId : null;

    // Use the cache — newly created primitives are already in cache.vars['COLOR']
    var allColorVars = cache.vars['COLOR'];

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
      var sv = getOrCreateVariable(t.token, semColl, 'COLOR', overwrite, cache);

      if (t.raw) {
        if (!sv.__existed || overwrite) sv.setValueForMode(semLightId, t.raw);
        if (darkEnabled) {
          if (!freePlanFallback && semDarkId) {
            if (!sv.__existed || overwrite) sv.setValueForMode(semDarkId, t.raw);
          } else if (freePlanFallback && semDarkColl && semDarkCollModeId) {
            var svDarkRaw = getOrCreateVariable(t.token, semDarkColl, 'COLOR', overwrite, cache);
            if (!svDarkRaw.__existed || overwrite) svDarkRaw.setValueForMode(semDarkCollModeId, t.raw);
            vars++;
          }
        }
        vars++;
        continue;
      }

      // varName: alias to a named primitive variable (e.g. color/transparent)
      if (t.varName) {
        var namedPrim = null;
        for (var nvi = 0; nvi < allColorVars.length; nvi++) {
          if (allColorVars[nvi].name === t.varName && allColorVars[nvi].variableCollectionId === lightColl.id) {
            namedPrim = allColorVars[nvi]; break;
          }
        }
        if (namedPrim) {
          var alias = figma.variables.createVariableAlias(namedPrim);
          if (!sv.__existed || overwrite) sv.setValueForMode(semLightId, alias);
          if (darkEnabled) {
            if (!freePlanFallback && semDarkId) {
              if (!sv.__existed || overwrite) sv.setValueForMode(semDarkId, figma.variables.createVariableAlias(namedPrim));
            } else if (freePlanFallback && semDarkColl && semDarkCollModeId) {
              var svDarkNamed = getOrCreateVariable(t.token, semDarkColl, 'COLOR', overwrite, cache);
              if (!svDarkNamed.__existed || overwrite) svDarkNamed.setValueForMode(semDarkCollModeId, figma.variables.createVariableAlias(namedPrim));
              vars++;
            }
          }
        }
        vars++;
        continue;
      }

      var lightStep = t.lightStep !== undefined ? t.lightStep : t.step;
      var darkStep  = t.darkStep  !== undefined ? t.darkStep  : t.step;

      var lightPrim = findVar(lightColl.id, t.colorName, lightStep);
      if (lightPrim && (!sv.__existed || overwrite)) sv.setValueForMode(semLightId, figma.variables.createVariableAlias(lightPrim));

      if (!freePlanFallback && darkEnabled && semDarkId) {
        // Paid plan: dark values as a second mode in the same Semantics collection
        var darkPrimColl = darkColl || lightColl;
        var darkPrim = findVar(darkPrimColl.id, t.colorName, darkStep);
        if (darkPrim && (!sv.__existed || overwrite)) sv.setValueForMode(semDarkId, figma.variables.createVariableAlias(darkPrim));
      } else if (freePlanFallback && semDarkColl && semDarkCollModeId) {
        // Free plan: dark values go into the separate "Semantics Dark" collection
        var svDark = getOrCreateVariable(t.token, semDarkColl, 'COLOR', overwrite, cache);
        var darkPrimColl2 = darkColl || lightColl;
        var darkPrim2 = findVar(darkPrimColl2.id, t.colorName, darkStep);
        if (darkPrim2 && (!svDark.__existed || overwrite)) svDark.setValueForMode(semDarkCollModeId, figma.variables.createVariableAlias(darkPrim2));
        vars++;
      }

      vars++;
    }

    collections++;
  }

  return { vars: vars, collections: collections };
}

// Tail-anchored semantic mapping — L(n) from bg end, D(n) from contrast end, M(±n) from brand anchor.
// Both light and dark primitive palettes run bg→contrast so the same index works in both modes.
function buildSemanticTokens(colorNames, steps) {
  var lower = colorNames.map(function(n) { return n.toLowerCase(); });
  var neutral = findColorKey(colorNames, 'neutral');
  var brand   = findColorKey(colorNames, 'brand');
  var n    = steps.length;
  var last = n - 1;
  var mid  = Math.floor(n / 2); // aligns with buildLightShades baseIdx

  var tokens = [];

  function L(i) { return steps[Math.min(last, i)]; }
  function D(i) { return steps[Math.max(0, last - i)]; }
  function M(o) { return steps[Math.min(last, Math.max(0, mid + (o || 0)))]; }

  function addL(tok, cn, i)       { tokens.push({ token: tok, colorName: cn, step: L(i) }); }
  function addD(tok, cn, i)       { tokens.push({ token: tok, colorName: cn, step: D(i) }); }
  function addM(tok, cn, o)       { tokens.push({ token: tok, colorName: cn, step: M(o) }); }
  // Explicit light + dark steps — use when light and dark modes need different palette positions
  function addS(tok, cn, ls, ds)  { tokens.push({ token: tok, colorName: cn, lightStep: ls, darkStep: ds }); }
  // lightStep = L(li), darkStep = D(di)
  function addLD(tok, cn, li, di) { tokens.push({ token: tok, colorName: cn, lightStep: L(li), darkStep: D(di) }); }

  var statuses = ['info', 'success', 'warning', 'error'];

  // ── Surface ───────────────────────────────────────────────────────────────────
  addL('surface/canvas',  neutral, 0);
  tokens.push({ token: 'surface/scrim', raw: { r: 0, g: 0, b: 0, a: 0.5 } });
  // floating: elevated surface for modals, popups, tooltips — one step above canvas
  addL('surface/floating', neutral, 1);

  // neutral elevation tiers — replaces primary/secondary/tertiary
  addL('surface/neutral/subtle',  neutral, 1);
  addL('surface/neutral/default', neutral, 2);
  addL('surface/neutral/strong',  neutral, 3);
  addD('surface/inversed',        neutral, 0);
  addL('surface/disabled',        neutral, 1);

  // brand tint surfaces — light: near-white tint; dark: L(2)/L(3) so tint is perceptible
  addS('surface/brand/subtle',   brand, L(0), L(2));
  addS('surface/brand/default',  brand, L(1), L(3));
  addS('surface/brand/strong',   brand, L(2), L(4));

  // interactive states
  addL('surface/interactive/default',          neutral, 0);
  addL('surface/interactive/hover',            neutral, 1);
  addL('surface/interactive/pressed',          neutral, 2);
  addS('surface/interactive/selected',         brand, L(0), L(2));
  addS('surface/interactive/selected/hover',   brand, L(1), L(3));

  // status tint surfaces
  for (var si = 0; si < statuses.length; si++) {
    if (lower.indexOf(statuses[si]) === -1) continue;
    addL('surface/' + statuses[si] + '/subtle', statuses[si], 0);
    addL('surface/' + statuses[si] + '/strong', statuses[si], 2);
  }

  // ── Text ─────────────────────────────────────────────────────────────────────
  addD('text/primary',     neutral, 1);
  addD('text/secondary',   neutral, 2);
  addD('text/tertiary',    neutral, 3);
  addL('text/inversed',    neutral, 0);
  // Light: D(3) = dark brand, readable on white. Dark: D(1) = light brand, readable on near-black.
  addS('text/brand',       brand, D(3), D(1));
  addD('text/disabled',    neutral, 4);
  addD('text/placeholder', neutral, 4); // same step as disabled — hint-level, distinct semantically

  if (lower.indexOf('info') !== -1) {
    addD('text/link',         'info', 3);
    addD('text/link-hover',   'info', 2);
    addD('text/link-visited', 'info', 4); // muted — one step lighter than default link
    addD('text/link-active',  'info', 1); // pressed — one step darker than hover
  }

  // Light: near-white on filled buttons. Dark: near-white on lighter dark-mode buttons.
  addLD('text/on-color', neutral, 0, 0);
  // Static — never change between modes; for text on photos or fixed-color backgrounds
  tokens.push({ token: 'text/static/white', raw: { r: 0.98, g: 0.98, b: 0.98, a: 1 } });
  tokens.push({ token: 'text/static/black', raw: { r: 0.02, g: 0.02, b: 0.02, a: 1 } });

  // status text
  for (var ti = 0; ti < statuses.length; ti++) {
    if (lower.indexOf(statuses[ti]) === -1) continue;
    // Light: D(3) = dark status tone on white. Dark: D(1) = light status tone on near-black.
    addS('text/' + statuses[ti], statuses[ti], D(3), D(1));
  }

  // ── Icon ─────────────────────────────────────────────────────────────────────
  addD('icon/primary',   neutral, 1);
  addD('icon/secondary', neutral, 2);
  addD('icon/tertiary',  neutral, 3);
  addL('icon/inversed',  neutral, 0);
  addS('icon/brand',     brand, D(3), D(1));
  addD('icon/disabled',  neutral, 4);
  addLD('icon/on-color', neutral, 0, 0);

  // status icon
  for (var ii = 0; ii < statuses.length; ii++) {
    if (lower.indexOf(statuses[ii]) === -1) continue;
    addS('icon/' + statuses[ii], statuses[ii], D(3), D(1));
  }

  // ── Border ───────────────────────────────────────────────────────────────────
  addL('border/neutral/subtle',  neutral, 2);
  addL('border/neutral/default', neutral, 3);
  addL('border/neutral/strong',  neutral, 4);
  addD('border/inversed',        neutral, 1);
  addL('border/disabled',        neutral, 2);
  addM('border/focus',           brand,   0);

  addL('border/brand/subtle',    brand, 2);
  addL('border/brand/default',   brand, 4);
  addM('border/brand/strong',    brand, 0);

  for (var bi = 0; bi < statuses.length; bi++) {
    if (lower.indexOf(statuses[bi]) === -1) continue;
    addL('border/' + statuses[bi] + '/subtle',  statuses[bi], 2);
    addL('border/' + statuses[bi] + '/default', statuses[bi], 4);
  }

  // ── Actions — filled / outlined / ghost ──────────────────────────────────────
  // brand + error: chromatic — mid-anchored M() for filled, split light/dark for outlined/ghost
  var chromaActions = [brand, lower.indexOf('error') !== -1 ? 'error' : null].filter(Boolean);
  for (var ai = 0; ai < chromaActions.length; ai++) {
    var ac = chromaActions[ai];

    addM('action/' + ac + '/filled/default', ac,  0);
    addM('action/' + ac + '/filled/hover',   ac,  1);
    addM('action/' + ac + '/filled/pressed', ac,  2);

    // outlined bg: 2-step gap above ghost/hover so the two components stay visually distinct
    addS('action/' + ac + '/outlined/default', ac, L(2), L(3));
    addS('action/' + ac + '/outlined/hover',   ac, L(3), L(4));
    addS('action/' + ac + '/outlined/pressed', ac, L(4), L(5));

    // ghost: transparent at rest — aliases color/transparent primitive
    tokens.push({ token: 'action/' + ac + '/ghost/default', varName: 'color/transparent' });
    addS('action/' + ac + '/ghost/hover',   ac, L(0), L(1));
    addS('action/' + ac + '/ghost/pressed', ac, L(1), L(2));
  }

  // neutral: achromatic — D() for filled/outlined (resolves to opposite luminosity end in dark primitives)
  addD('action/neutral/filled/default',   neutral, 2);
  addD('action/neutral/filled/hover',     neutral, 1);
  addD('action/neutral/filled/pressed',   neutral, 0);

  addL('action/neutral/outlined/default', neutral, 2);
  addL('action/neutral/outlined/hover',   neutral, 3);
  addL('action/neutral/outlined/pressed', neutral, 4);

  tokens.push({ token: 'action/neutral/ghost/default', varName: 'color/transparent' });
  addL('action/neutral/ghost/hover',   neutral, 0);
  addL('action/neutral/ghost/pressed', neutral, 1);

  return tokens;
}

// ── spacing ───────────────────────────────────────────────────────────────────

async function generateSpacing(cfg, cache) {
  var collectionName = cfg.collection || 'Spacing';
  var base = parseInt(cfg.base || '4');
  var qty = cfg.qty || 'standard';
  var count = qty === 'compact' ? 8 : qty === 'system' ? 16 : 12;
  var naming = cfg.naming || 'size';
  var prefix = cfg.prefix || 'sp';
  var overwrite = cfg.overwrite !== false;

  var collection = getOrCreateCollection(collectionName, cache);
  var modeId = collection.modes[0].modeId;

  var vars = 0;
  for (var i = 1; i <= count; i++) {
    var value = base * i;
    var tokenName = naming === 'number'
      ? 'spacing/' + prefix + '-' + value
      : 'spacing/' + prefix + '-' + i;
    var v = getOrCreateVariable(tokenName, collection, 'FLOAT', overwrite, cache);
    applyVar(v, modeId, value, overwrite);
    vars++;
  }

  return { vars: vars };
}

// ── border radius ─────────────────────────────────────────────────────────────

async function generateBorderRadius(cfg, cache) {
  var collectionName = cfg.collection || 'Border Radius';
  var prefix = cfg.prefix || 'rd';
  var base = parseInt(cfg.base || '4');
  var qty = cfg.qty || 'standard';
  var count = qty === 'compact' ? 4 : qty === 'system' ? 8 : 6;
  var naming = cfg.naming || 'size';
  var includeFull = cfg.full !== false;
  var overwrite = cfg.overwrite !== false;

  var collection = getOrCreateCollection(collectionName, cache);
  var modeId = collection.modes[0].modeId;

  var vars = 0;
  for (var i = 0; i < count; i++) {
    var value = i === 0 ? 0 : base * i;
    var name = naming === 'number' ? ('' + value) : ('' + (i + 1));
    var v = getOrCreateVariable('radius/' + prefix + '-' + name, collection, 'FLOAT', overwrite, cache);
    applyVar(v, modeId, value, overwrite);
    vars++;
  }
  if (includeFull) {
    var vf = getOrCreateVariable('radius/' + prefix + '-full', collection, 'FLOAT', overwrite, cache);
    applyVar(vf, modeId, 9999, overwrite);
    vars++;
  }

  return { vars: vars };
}

// ── typography ────────────────────────────────────────────────────────────────

async function generateTypography(cfg, cache) {
  var fonts    = cfg.fonts || [
    { name: 'Geist', ratio: 'minor-third', uses: { Heading: true, Title: true } },
    { name: 'Inter', ratio: 'minor-third', uses: { Body: true, Label: true, Caption: true, Button: true, Link: true } },
  ];
  var preset   = cfg.size || 'standard';
  var overwrite = cfg.overwrite !== false;

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

  var typoColl   = getOrCreateCollection('Typography', cache);
  var typoModeId = typoColl.modes[0].modeId;
  var existingStyles = cache.textStyles;
  var totalVars = 0;
  var totalStyles = 0;

  // Single shared letter-spacing variable — always 0
  var lsVar = getOrCreateVariable('letter-spacing/none', typoColl, 'FLOAT', overwrite, cache);
  applyVar(lsVar, typoModeId, 0, overwrite);
  totalVars++;

  // Pre-load every font already used by existing text styles so we can modify them
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

  for (var fi = 0; fi < fonts.length; fi++) {
    var font   = fonts[fi];
    var family = font.name || 'Inter';
    var uses   = font.uses || {};
    var cats   = Object.keys(uses).filter(function(k) { return uses[k] && sizes[k]; });

    // Pre-load every weight this family will need so existing styles can be modified
    var allWeights = ['Regular', 'Medium', 'Semi Bold'];
    for (var wi = 0; wi < allWeights.length; wi++) {
      try { await figma.loadFontAsync({ family: family, style: allWeights[wi] }); } catch (e) {}
    }

    for (var ki = 0; ki < cats.length; ki++) {
      var cat    = cats[ki];
      var weight = weightFor[cat] || 'Regular';
      var lhPct  = lineHeightFor[cat] || 140;

      // per-category variables
      var ffVar = getOrCreateVariable('font-family/' + cat, typoColl, 'STRING', overwrite, cache);
      applyVar(ffVar, typoModeId, family, overwrite);
      totalVars++;

      var wNum = weight === 'Semi Bold' ? 600 : weight === 'Medium' ? 500 : 400;
      var fwVar = getOrCreateVariable('font-weight/' + cat, typoColl, 'FLOAT', overwrite, cache);
      applyVar(fwVar, typoModeId, wNum, overwrite);
      totalVars++;

      // load font once per category
      try {
        await figma.loadFontAsync({ family: family, style: weight });
      } catch (e) {
        try {
          await figma.loadFontAsync({ family: family, style: 'Regular' });
          weight = 'Regular';
        } catch (e2) { continue; }
      }

      var slist = applyRatio(sizes[cat], cat, font.ratio);
      for (var si = 0; si < slist.length; si++) {
        var sName     = slist[si][0];
        var px        = slist[si][1];
        var base      = cat + '/' + sName;
        var styleName = cat + '/' + sName;

        var fsVar = getOrCreateVariable('font-size/' + base, typoColl, 'FLOAT', overwrite, cache);
        applyVar(fsVar, typoModeId, px, overwrite);
        totalVars++;

        var lhVar = getOrCreateVariable('line-height/' + base, typoColl, 'FLOAT', overwrite, cache);
        applyVar(lhVar, typoModeId, Math.round(px * lhPct / 100), overwrite);
        totalVars++;

        var style = null;
        for (var ei = 0; ei < existingStyles.length; ei++) {
          if (existingStyles[ei].name === styleName) { style = existingStyles[ei]; break; }
        }
        if (!style) { style = figma.createTextStyle(); cache.textStyles.push(style); }
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

        try { style.setBoundVariable('fontFamily',    ffVar); } catch (e) {}
        try { style.setBoundVariable('fontSize',      fsVar); } catch (e) {}
        try { style.setBoundVariable('lineHeight',    lhVar); } catch (e) {}
        try { style.setBoundVariable('letterSpacing', lsVar); } catch (e) {}
        try { style.setBoundVariable('fontWeight',    fwVar); } catch (e) {}
      }
    }
  }

  return { vars: totalVars, styles: totalStyles };
}

// ── elevation ────────────────────────────────────────────────────────────────

async function generateElevation(cfg, cache) {
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

  var elevColl   = getOrCreateCollection(collectionName, cache);
  var elevModeId = elevColl.modes[0].modeId;
  var existingStyles = cache.effectStyles;
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

      var blurVar = getOrCreateVariable(base + '/blur' + sfx,    elevColl, 'FLOAT', overwrite, cache);
      applyVar(blurVar, elevModeId, eff.radius, overwrite);

      var yVar = getOrCreateVariable(base + '/y' + sfx,          elevColl, 'FLOAT', overwrite, cache);
      applyVar(yVar, elevModeId, eff.offset.y, overwrite);

      var xVar = getOrCreateVariable(base + '/x' + sfx,          elevColl, 'FLOAT', overwrite, cache);
      applyVar(xVar, elevModeId, eff.offset.x, overwrite);

      var spreadVar = getOrCreateVariable(base + '/spread' + sfx, elevColl, 'FLOAT', overwrite, cache);
      applyVar(spreadVar, elevModeId, eff.spread, overwrite);

      var colorVar = getOrCreateVariable(base + '/color' + sfx,   elevColl, 'COLOR', overwrite, cache);
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
    if (!style) { style = figma.createEffectStyle(); cache.effectStyles.push(style); }
    if (!style.name || overwrite) {
      style.name    = styleName;
      style.effects = boundEffects.length > 0 ? boundEffects : [];
    }
  }

  return { vars: totalVars, styles: levels.length };
}

// ── stylesheet ────────────────────────────────────────────────────────────────

async function generateStylesheet(modules, moduleConfigs, cache, pageOpts) {
  var targetPageName = (pageOpts && pageOpts.pageName && pageOpts.pageName.trim())
    ? pageOpts.pageName.trim() : 'Token Stylesheet';
  var useCurrentPage = !!(pageOpts && pageOpts.useCurrentPage);

  // ── page resolution ───────────────────────────────────────────────────────
  var page = null;
  if (useCurrentPage) {
    page = figma.currentPage;
  } else {
    // 1. Find by pluginData (survives rename)
    try {
      var _pages = figma.root.children;
      for (var pi = 0; pi < _pages.length; pi++) {
        try { if (_pages[pi].getPluginData('isTokenStylesheet') === 'true') { page = _pages[pi]; break; } } catch(e) {}
      }
    } catch(e) {}
    // 2. Fallback: find by name
    if (!page) {
      try {
        var _pages2 = figma.root.children;
        for (var pi2 = 0; pi2 < _pages2.length; pi2++) {
          if (_pages2[pi2].name === targetPageName) { page = _pages2[pi2]; break; }
        }
      } catch(e) {}
    }
    // 3. Create new page
    if (!page) {
      try { page = figma.createPage(); page.name = targetPageName; }
      catch(e) { throw new Error('sheet-page: ' + e.message); }
    }
    // Stamp so future lookups survive rename; persist name to clientStorage
    try { page.setPluginData('isTokenStylesheet', 'true'); } catch(e) {}
    try { await figma.clientStorage.setAsync('stylesheetPageName', targetPageName); } catch(e) {}
  }

  // Switch to stylesheet page so nodes are created in the right context
  var _prevPage = figma.currentPage;
  if (!useCurrentPage) { try { figma.currentPage = page; } catch(e) {} }

  // Load page before accessing children (required for dynamic-page documentAccess)
  try { await page.loadAsync(); } catch(e) {}

  // ── remove only frames that will be regenerated this run ──────────────────
  // "Colors — Dark" is always removed when Colors is active; re-added only if darkMode on
  var FRAME_ORDER = ['Colors — Light', 'Colors — Dark', 'Spacing', 'Typography', 'Border Radius', 'Elevation'];
  var toRemove = {};
  if (modules['Colors'])        { toRemove['Colors — Light'] = true; toRemove['Colors — Dark'] = true; }
  if (modules['Spacing'])       toRemove['Spacing'] = true;
  if (modules['Typography'])    toRemove['Typography'] = true;
  if (modules['Border Radius']) toRemove['Border Radius'] = true;
  if (modules['Elevation'])     toRemove['Elevation'] = true;

  try {
    var _n = page.children ? page.children.length : 0;
    for (var _ki = _n - 1; _ki >= 0; _ki--) {
      try { if (toRemove[page.children[_ki].name]) page.children[_ki].remove(); } catch(e) {}
    }
  } catch(e) {}

  // ── load fonts ────────────────────────────────────────────────────────────
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch(e) {}
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Medium' }); } catch(e) {}
  try { await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' }); } catch(e) {}

  // ── generate frames (x=0 placeholder — canonical order applied below) ─────
  if (modules['Colors']) {
    try { await ssColors(page, 0, moduleConfigs['Colors'] || {}, cache); } catch(e) {}
  }
  if (modules['Spacing']) {
    try { await ssSpacing(page, 0, moduleConfigs['Spacing'] || {}, cache); } catch(e) {}
  }
  if (modules['Typography']) {
    try { await ssTypography(page, 0, moduleConfigs['Typography'] || {}, cache); } catch(e) {}
  }
  if (modules['Border Radius']) {
    try { await ssRadius(page, 0, moduleConfigs['Border Radius'] || {}, cache); } catch(e) {}
  }
  if (modules['Elevation']) {
    try { await ssElevation(page, 0, cache); } catch(e) {}
  }

  // ── reposition all plugin frames in canonical left-to-right order ─────────
  var xPos = 40;
  for (var fi = 0; fi < FRAME_ORDER.length; fi++) {
    var fname = FRAME_ORDER[fi];
    try {
      var _pc = page.children;
      for (var ci = 0; ci < _pc.length; ci++) {
        if (_pc[ci].name === fname) {
          _pc[ci].x = xPos;
          _pc[ci].y = 40;
          xPos += _pc[ci].width + 40;
          break;
        }
      }
    } catch(e) {}
  }

  // Restore previous page
  try { if (_prevPage && _prevPage !== page) figma.currentPage = _prevPage; } catch(e) {}
}

// ── stylesheet helpers ────────────────────────────────────────────────────────

function _ssTxt(parent, str, x, y, sz, wt, col) {
  var t = figma.createText();
  t.characters = String(str);
  t.fontSize = sz;
  t.fontName = { family: 'Inter', style: wt || 'Regular' };
  t.fills = [{ type: 'SOLID', color: _ssRgb(col || '#333333') }];
  t.x = x; t.y = y;
  parent.appendChild(t);
  return t;
}

function _ssRgb(hex) {
  var v = (hex || '#000').replace('#', '');
  if (v.length === 3) v = v[0]+v[0]+v[1]+v[1]+v[2]+v[2];
  return { r: parseInt(v.slice(0,2),16)/255, g: parseInt(v.slice(2,4),16)/255, b: parseInt(v.slice(4,6),16)/255 };
}

function _ssShell(page, name, xOff) {
  var f = figma.createFrame();
  f.name = name;
  f.x = xOff; f.y = 40;
  f.resize(200, 200);
  f.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  f.cornerRadius = 8;
  f.effects = [{
    type: 'DROP_SHADOW', visible: true, blendMode: 'NORMAL',
    color: { r: 0, g: 0, b: 0, a: 0.07 },
    offset: { x: 0, y: 2 }, radius: 12, spread: 0,
  }];
  page.appendChild(f);
  return f;
}

function _ssToHex(c) {
  var r = ('0' + Math.round(c.r * 255).toString(16)).slice(-2);
  var g = ('0' + Math.round(c.g * 255).toString(16)).slice(-2);
  var b = ('0' + Math.round(c.b * 255).toString(16)).slice(-2);
  return '#' + r + g + b;
}

function _ssDivider(parent, x, y, w, col) {
  var d = figma.createRectangle();
  d.resize(w, 1);
  d.x = x; d.y = y;
  d.fills = [{ type: 'SOLID', color: col || { r: 0.9, g: 0.9, b: 0.9 } }];
  parent.appendChild(d);
}

// ── colors (light + dark frames, each with primitives + semantics) ─────────────

async function ssColors(page, xOff, cfg, cache) {
  var PAD = 32;
  // Primitive swatch dims
  var SW_P = 88, SH_P = 56, SW_P_GAP = 6;
  // Semantic column layout
  var SEM_SW = 14, SEM_COL_W = 150, SEM_COL_GAP = 16, SEM_ROW_H = 20;
  var SEM_COLS_ORDER = ['surface', 'text', 'icon', 'border', 'action'];

  var darkEnabled = cfg.darkModeOn || false;
  var semanticOn  = cfg.semanticOn  || false;
  var collName     = cfg.collection         || 'Primitives';
  var darkCollName = collName + ' Dark';
  var semName      = cfg.semanticCollection || 'Semantics';

  var collections = cache.collections;
  var primColl = null, darkPrimColl = null, semColl = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === collName)     primColl     = collections[i];
    if (collections[i].name === darkCollName) darkPrimColl = collections[i];
    if (collections[i].name === semName)      semColl      = collections[i];
  }
  if (!primColl) return null;

  var allColorVars = cache.vars['COLOR'];

  function getPrimVars(coll) {
    return allColorVars.filter(function(v) {
      return v.variableCollectionId === coll.id && v.name.startsWith('color/');
    });
  }

  function groupAndSort(vars) {
    var g = {}, names = [];
    for (var vi = 0; vi < vars.length; vi++) {
      var pts = vars[vi].name.split('/');
      if (pts.length < 3) continue;
      if (!g[pts[1]]) { g[pts[1]] = []; names.push(pts[1]); }
      g[pts[1]].push(vars[vi]);
    }
    names.forEach(function(n) {
      g[n].sort(function(a, b) {
        return (parseInt(a.name.split('/')[2]) || 0) - (parseInt(b.name.split('/')[2]) || 0);
      });
    });
    return { groups: g, cNames: names };
  }

  var lightData = groupAndSort(getPrimVars(primColl));
  var darkData  = (darkEnabled && darkPrimColl) ? groupAndSort(getPrimVars(darkPrimColl)) : null;

  // ── semantic setup ──
  var semVars = [], semLightId = null, semDarkId = null;
  var semGroups = {};
  if (semanticOn && semColl) {
    semLightId = semColl.modes[0].modeId;
    semDarkId  = semColl.modes.length > 1 ? semColl.modes[1].modeId : null;
    semVars = allColorVars.filter(function(v) { return v.variableCollectionId === semColl.id; });
    for (var vi = 0; vi < semVars.length; vi++) {
      var pref = semVars[vi].name.split('/')[0];
      if (!semGroups[pref]) semGroups[pref] = [];
      semGroups[pref].push(semVars[vi]);
    }
    // add any extra prefixes not in default order
    Object.keys(semGroups).forEach(function(k) {
      if (SEM_COLS_ORDER.indexOf(k) === -1) SEM_COLS_ORDER.push(k);
    });
  }

  // ── free-plan dark semantics: separate "Semantics Dark" collection ──
  var semDarkCollFP = null, semDarkGroupsFP = {}, semDarkCollModeIdFP = null;
  if (semanticOn && !semDarkId) {
    for (var j = 0; j < collections.length; j++) {
      if (collections[j].name === semName + ' Dark') { semDarkCollFP = collections[j]; break; }
    }
    if (semDarkCollFP) {
      semDarkCollModeIdFP = semDarkCollFP.modes[0].modeId;
      var sdVars = allColorVars.filter(function(v) { return v.variableCollectionId === semDarkCollFP.id; });
      for (var vi2 = 0; vi2 < sdVars.length; vi2++) {
        var sdPref = sdVars[vi2].name.split('/')[0];
        if (!semDarkGroupsFP[sdPref]) semDarkGroupsFP[sdPref] = [];
        semDarkGroupsFP[sdPref].push(sdVars[vi2]);
      }
    }
  }

  // ── frame width ──
  var maxShades = lightData.cNames.reduce(function(m, n) { return Math.max(m, lightData.groups[n].length); }, 0);
  var primInnerW = Math.max(0, maxShades * (SW_P + SW_P_GAP) - SW_P_GAP);
  var semInnerW  = SEM_COLS_ORDER.length * (SEM_COL_W + SEM_COL_GAP) - SEM_COL_GAP;
  var innerW     = Math.max(primInnerW, semanticOn ? semInnerW : 0);
  var frameW     = PAD + innerW + PAD;

  async function buildColorFrame(title, xPos, isDark, primData, primCollRef) {
    var frame = _ssShell(page, title, xPos);
    frame.fills = [{ type: 'SOLID', color: isDark ? { r: 0.08, g: 0.08, b: 0.08 } : { r: 1, g: 1, b: 1 } }];

    // Apply dark variable mode so semantic aliases resolve to dark-mode values
    if (isDark && semColl && semDarkId) {
      try { frame.setExplicitVariableModeForCollection(semColl, semDarkId); } catch(e) {}
    }

    var modeId      = primCollRef.modes[0].modeId;
    var titleCol    = isDark ? '#EEEEEE' : '#1A1A1A';
    var primHdrCol  = isDark ? '#EEEEEE' : '#1A1A1A';
    var colorHdrCol = isDark ? '#CCCCCC' : '#555555';
    var metaCol     = isDark ? '#999999' : '#999999';
    var semHdrCol   = isDark ? '#999999' : '#AAAAAA';
    var semLblCol   = isDark ? '#CCCCCC' : '#555555';
    var dividerClr  = isDark ? _ssRgb('#2A2A2A') : _ssRgb('#E8E8E8');

    var y = PAD;
    _ssTxt(frame, title, PAD, y, 24, 'Medium', titleCol);
    y += 52;

    // ── Primitive swatches ──
    for (var ci = 0; ci < primData.cNames.length; ci++) {
      var cn = primData.cNames[ci];
      var shades = primData.groups[cn];

      _ssTxt(frame, cn.charAt(0).toUpperCase() + cn.slice(1), PAD, y, 11, 'Medium', primHdrCol);
      y += 20;

      // Swatch row
      for (var si = 0; si < shades.length; si++) {
        var sv = shades[si];
        var val = sv.valuesByMode[modeId];
        var fillClr = (val && typeof val.r === 'number') ? { r: val.r, g: val.g, b: val.b } : { r: 0.85, g: 0.85, b: 0.85 };
        var sx = PAD + si * (SW_P + SW_P_GAP);

        var rect = figma.createRectangle();
        rect.resize(SW_P, SH_P);
        rect.x = sx; rect.y = y;
        rect.cornerRadius = 4;
        rect.fills = [{ type: 'SOLID', color: fillClr,
          boundVariables: { color: figma.variables.createVariableAlias(sv) } }];
        frame.appendChild(rect);
      }
      y += SH_P + 8;

      // Labels below each swatch: step name / hex / rgb
      for (var si2 = 0; si2 < shades.length; si2++) {
        var sv2 = shades[si2];
        var val2 = sv2.valuesByMode[modeId];
        var sx2 = PAD + si2 * (SW_P + SW_P_GAP);
        var pts2 = sv2.name.split('/');
        var stepLabel = (pts2[1] || '') + '/' + (pts2[2] || '');

        _ssTxt(frame, stepLabel, sx2, y,      9, 'Medium', colorHdrCol);
        var hexStr = (val2 && typeof val2.r === 'number') ? 'hex ' + _ssToHex(val2).toUpperCase() : '—';
        _ssTxt(frame, hexStr,    sx2, y + 13, 9, 'Regular', metaCol);
        var rgbStr = (val2 && typeof val2.r === 'number')
          ? 'rgb ' + Math.round(val2.r*255) + ', ' + Math.round(val2.g*255) + ', ' + Math.round(val2.b*255)
          : '—';
        _ssTxt(frame, rgbStr,    sx2, y + 26, 9, 'Regular', metaCol);
      }
      y += 39 + 20; // 3 label rows (13px each) + gap between color groups
    }

    // ── Semantic section ──
    var useFreePlanDark = isDark && !semDarkId && semDarkCollFP;
    var activeSemGroups = useFreePlanDark ? semDarkGroupsFP : semGroups;
    var hasSemanticContent = semanticOn && semColl && (useFreePlanDark ? Object.keys(semDarkGroupsFP).length > 0 : semVars.length > 0);
    if (hasSemanticContent) {
      var semModeId = useFreePlanDark ? semDarkCollModeIdFP : ((isDark && semDarkId) ? semDarkId : semLightId);

      y += 4;
      _ssDivider(frame, PAD, y, innerW, dividerClr);
      y += 24;

      _ssTxt(frame, 'Semantic', PAD, y, 11, 'Medium', primHdrCol);
      y += 28;

      var colX = PAD;
      var colMaxY = y;

      for (var gi = 0; gi < SEM_COLS_ORDER.length; gi++) {
        var gpref = SEM_COLS_ORDER[gi];
        var gvars = activeSemGroups[gpref];
        if (!gvars || gvars.length === 0) { colX += SEM_COL_W + SEM_COL_GAP; continue; }

        var cx = colX;
        var cy = y;

        _ssTxt(frame, gpref, cx, cy, 9, 'Medium', semHdrCol);
        cy += 18;

        for (var gvi = 0; gvi < gvars.length; gvi++) {
          var gv  = gvars[gvi];
          var gval = gv.valuesByMode[semModeId];
          var gFillClr = (gval && typeof gval.r === 'number') ? { r: gval.r, g: gval.g, b: gval.b } : { r: 0.85, g: 0.85, b: 0.85 };

          var gr = figma.createRectangle();
          gr.resize(SEM_SW, SEM_SW);
          gr.x = cx; gr.y = cy;
          gr.cornerRadius = 2;
          gr.fills = [{ type: 'SOLID', color: gFillClr,
            boundVariables: { color: figma.variables.createVariableAlias(gv) } }];
          frame.appendChild(gr);

          _ssTxt(frame, gv.name, cx + SEM_SW + 6, cy + 1, 9, 'Regular', semLblCol);
          cy += SEM_ROW_H;
        }

        if (cy > colMaxY) colMaxY = cy;
        colX += SEM_COL_W + SEM_COL_GAP;
      }
      y = colMaxY;
    }

    frame.resize(frameW, y + PAD);
    return frame;
  }

  var x = xOff;
  await buildColorFrame('Colors — Light', x, false, lightData, primColl);
  x += frameW + 40;

  if (darkEnabled) {
    var useDarkData = darkData || lightData;
    var useDarkColl = darkPrimColl || primColl;
    await buildColorFrame('Colors — Dark', x, true, useDarkData, useDarkColl);
    x += frameW + 40;
  }

  return { totalWidth: x - xOff - 40 };
}

// ── spacing ───────────────────────────────────────────────────────────────────

async function ssSpacing(page, xOff, cfg, cache) {
  var PAD = 32, NAME_W = 140, VAL_W = 44, MAX_BAR = 200, BAR_H = 8;
  var collName = cfg.collection || 'Spacing';

  var collections = cache.collections;
  var coll = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === collName) { coll = collections[i]; break; }
  }
  if (!coll) return null;

  var allVars = cache.vars['FLOAT'];
  var spVars = allVars.filter(function(v) {
    return v.variableCollectionId === coll.id && v.name.startsWith('spacing/');
  });
  var modeId = coll.modes[0].modeId;
  spVars.sort(function(a, b) {
    return (a.valuesByMode[modeId] || 0) - (b.valuesByMode[modeId] || 0);
  });
  if (spVars.length === 0) return null;

  var maxVal = spVars.reduce(function(m, v) { return Math.max(m, v.valuesByMode[modeId] || 0); }, 0);
  var frameW = PAD + NAME_W + VAL_W + MAX_BAR + PAD;
  var frame = _ssShell(page, 'Spacing', xOff);
  var y = PAD;

  _ssTxt(frame, 'Spacing', PAD, y, 24, 'Medium', '#1A1A1A');
  y += 44;

  for (var vi = 0; vi < spVars.length; vi++) {
    var sv = spVars[vi];
    var val = sv.valuesByMode[modeId] || 0;
    var barW = maxVal > 0 ? Math.max(2, Math.round(val / maxVal * MAX_BAR)) : 2;

    _ssTxt(frame, sv.name, PAD, y, 9, 'Medium', '#333333');
    _ssTxt(frame, val + 'px', PAD + NAME_W, y, 9, 'Regular', '#777777');

    var bar = figma.createRectangle();
    bar.resize(barW, BAR_H);
    bar.x = PAD + NAME_W + VAL_W; bar.y = y;
    bar.cornerRadius = 2;
    bar.fills = [{ type: 'SOLID', color: _ssRgb('#3D78FF'), opacity: 0.6 }];
    frame.appendChild(bar);

    y += BAR_H + 14;
  }

  frame.resize(frameW, y + PAD - 14);
  return frame;
}

// ── typography ────────────────────────────────────────────────────────────────

async function ssTypography(page, xOff, cfg, cache) {
  var PAD = 32;
  // Column order: style | font-family | font-size | line-height | font-weight | example
  var COL_NAME = 120, COL_FAM = 96, COL_SIZE = 52, COL_LH = 72, COL_WT = 128, COL_PREV = 120, COL_GAP = 16;
  var ROW_H = 36;
  var WT_MAP = {
    'Thin':100, 'ExtraLight':200, 'Extra Light':200,
    'Light':300, 'Regular':400, 'Medium':500,
    'SemiBold':600, 'Semi Bold':600,
    'Bold':700, 'ExtraBold':800, 'Extra Bold':800, 'Black':900,
  };

  var styles = cache.textStyles;
  if (styles.length === 0) return null;

  var catOrder = ['Heading', 'Title', 'Body', 'Label', 'Caption', 'Button', 'Link'];
  styles.sort(function(a, b) {
    var ac = a.name.split('/')[0], bc = b.name.split('/')[0];
    var ai = catOrder.indexOf(ac), bi = catOrder.indexOf(bc);
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    return a.name.localeCompare(b.name);
  });

  var innerW = COL_NAME + COL_GAP + COL_FAM + COL_GAP + COL_SIZE + COL_GAP + COL_LH + COL_GAP + COL_WT + COL_GAP + COL_PREV;
  var frameW = PAD + innerW + PAD;
  var frame = _ssShell(page, 'Typography', xOff);
  var y = PAD;

  _ssTxt(frame, 'Typography', PAD, y, 24, 'Medium', '#1A1A1A');
  y += 44;

  // Header row — CSS property names
  var hx = PAD;
  _ssTxt(frame, 'style',       hx, y, 9, 'Medium', '#444444'); hx += COL_NAME + COL_GAP;
  _ssTxt(frame, 'font-family', hx, y, 9, 'Medium', '#444444'); hx += COL_FAM  + COL_GAP;
  _ssTxt(frame, 'font-size',   hx, y, 9, 'Medium', '#444444'); hx += COL_SIZE + COL_GAP;
  _ssTxt(frame, 'line-height', hx, y, 9, 'Medium', '#444444'); hx += COL_LH   + COL_GAP;
  _ssTxt(frame, 'font-weight', hx, y, 9, 'Medium', '#444444'); hx += COL_WT   + COL_GAP;
  _ssTxt(frame, 'example',     hx, y, 9, 'Medium', '#444444');
  y += 20;
  _ssDivider(frame, PAD, y, innerW);
  y += 8;

  var prevCat = null;
  for (var si = 0; si < styles.length; si++) {
    var style = styles[si];
    var parts = style.name.split('/');
    var cat = parts[0], variant = parts[1] || '';

    if (prevCat !== null && cat !== prevCat) {
      _ssDivider(frame, PAD, y + 4, innerW);
      y += 10;
    }
    prevCat = cat;

    // line-height
    var lhStr = '—';
    if (style.lineHeight) {
      if (style.lineHeight.unit === 'PERCENT') {
        lhStr = Math.round(style.fontSize * style.lineHeight.value / 100) + 'px';
      } else if (style.lineHeight.unit === 'PIXELS') {
        lhStr = Math.round(style.lineHeight.value) + 'px';
      }
    }

    // font-weight: "Semi Bold / 600"
    var wtName  = (style.fontName && style.fontName.style) ? style.fontName.style : '—';
    var wtNum   = WT_MAP[wtName];
    var wtLabel = wtNum ? wtName + ' / ' + wtNum : wtName;

    // font-family
    var famLabel = (style.fontName && style.fontName.family) ? style.fontName.family : '—';

    // Row height adapts to the actual font size so headings aren't clipped
    var rowH = Math.max(ROW_H, style.fontSize + 12);
    var labelY = y + Math.round((rowH - 9) / 2);

    var cx = PAD;
    _ssTxt(frame, cat + ' / ' + variant, cx, labelY, 9, 'Medium', '#333333'); cx += COL_NAME + COL_GAP;
    _ssTxt(frame, famLabel,              cx, labelY, 9, 'Regular', '#777777'); cx += COL_FAM  + COL_GAP;
    _ssTxt(frame, style.fontSize + 'px', cx, labelY, 9, 'Regular', '#777777'); cx += COL_SIZE + COL_GAP;
    _ssTxt(frame, lhStr,                 cx, labelY, 9, 'Regular', '#777777'); cx += COL_LH   + COL_GAP;
    _ssTxt(frame, wtLabel,               cx, labelY, 9, 'Regular', '#777777'); cx += COL_WT   + COL_GAP;

    // Example — apply Figma text style directly
    try {
      var fn = style.fontName || { family: 'Inter', style: 'Regular' };
      await figma.loadFontAsync(fn);
      var pv = figma.createText();
      pv.characters = 'Aa';
      pv.fills = [{ type: 'SOLID', color: { r: 0.13, g: 0.13, b: 0.13 } }];
      pv.x = cx; pv.y = y;
      frame.appendChild(pv);
      try {
        await pv.setTextStyleIdAsync(style.id);
      } catch(e2) {
        pv.fontName = fn;
        pv.fontSize = style.fontSize || 16;
      }
      var pvSz = pv.fontSize || style.fontSize || 16;
      pv.y = y + Math.round((rowH - pvSz) / 2);
    } catch(e) {}

    y += rowH;
  }

  frame.resize(frameW, y + PAD);
  return frame;
}

// ── border radius ─────────────────────────────────────────────────────────────

async function ssRadius(page, xOff, cfg, cache) {
  var PAD = 32, CARD = 60, GAP = 16;
  var collName = cfg.collection || 'Border Radius';

  var collections = cache.collections;
  var coll = null;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === collName) { coll = collections[i]; break; }
  }
  if (!coll) return null;

  var allVars = cache.vars['FLOAT'];
  var rdVars = allVars.filter(function(v) {
    return v.variableCollectionId === coll.id && v.name.startsWith('radius/');
  });
  var modeId = coll.modes[0].modeId;
  rdVars.sort(function(a, b) {
    return (a.valuesByMode[modeId] || 0) - (b.valuesByMode[modeId] || 0);
  });
  if (rdVars.length === 0) return null;

  var frameW = PAD + rdVars.length * (CARD + GAP) - GAP + PAD;
  var frame = _ssShell(page, 'Border Radius', xOff);
  var y = PAD;

  _ssTxt(frame, 'Border Radius', PAD, y, 24, 'Medium', '#1A1A1A');
  y += 44;

  for (var vi = 0; vi < rdVars.length; vi++) {
    var rv = rdVars[vi];
    var val = rv.valuesByMode[modeId] || 0;
    var rx = PAD + vi * (CARD + GAP);

    var rect = figma.createRectangle();
    rect.resize(CARD, CARD);
    rect.x = rx; rect.y = y;
    rect.cornerRadius = Math.min(val, CARD / 2);  // fallback visual
    rect.fills = [{ type: 'SOLID', color: _ssRgb('#EBF0FF') }];
    rect.strokes = [{ type: 'SOLID', color: _ssRgb('#BDCBFF') }];
    rect.strokeWeight = 1;
    frame.appendChild(rect);
    // Bind corner radius to the variable so it updates when tokens change
    try {
      var rdAlias = figma.variables.createVariableAlias(rv);
      rect.setBoundVariable('topLeftRadius', rdAlias);
      rect.setBoundVariable('topRightRadius', rdAlias);
      rect.setBoundVariable('bottomLeftRadius', rdAlias);
      rect.setBoundVariable('bottomRightRadius', rdAlias);
    } catch(e) {}

    var shortName = rv.name.replace('radius/', '');
    _ssTxt(frame, shortName, rx, y + CARD + 6, 8, 'Medium', '#333333');
    _ssTxt(frame, val >= 9000 ? '∞' : val + 'px', rx, y + CARD + 18, 8, 'Regular', '#999999');
  }

  frame.resize(frameW, y + CARD + 34 + PAD);
  return frame;
}

// ── elevation ─────────────────────────────────────────────────────────────────

async function ssElevation(page, xOff, cache) {
  var PAD = 32, CARD_W = 80, CARD_H = 56, GAP = 28;

  var styles = cache.effectStyles;
  if (styles.length === 0) return null;

  var frameW = PAD + styles.length * (CARD_W + GAP) - GAP + PAD;
  var frame = _ssShell(page, 'Elevation', xOff);
  var y = PAD;

  _ssTxt(frame, 'Elevation', PAD, y, 24, 'Medium', '#1A1A1A');
  y += 52;

  for (var si = 0; si < styles.length; si++) {
    var style = styles[si];
    var cx = PAD + si * (CARD_W + GAP);

    var card = figma.createRectangle();
    card.resize(CARD_W, CARD_H);
    card.x = cx; card.y = y;
    card.cornerRadius = 6;
    card.fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    frame.appendChild(card);
    // Apply effect style directly (node must be in document tree first)
    try {
      await card.setEffectStyleIdAsync(style.id);
    } catch(e) {
      // Fallback: copy raw effect values
      var cleanEffects = (style.effects || []).map(function(eff) {
        return {
          type: eff.type, visible: eff.visible !== false, blendMode: eff.blendMode || 'NORMAL',
          color: eff.color || { r: 0, g: 0, b: 0, a: 0.1 },
          offset: eff.offset || { x: 0, y: 2 },
          radius: typeof eff.radius === 'number' ? eff.radius : 4,
          spread: typeof eff.spread === 'number' ? eff.spread : 0,
        };
      });
      try { if (cleanEffects.length > 0) card.effects = cleanEffects; } catch(e2) {}
    }

    var shortName = style.name.split('/').pop() || style.name;
    _ssTxt(frame, shortName, cx, y + CARD_H + 8, 8, 'Medium', '#333333');
  }

  frame.resize(frameW, y + CARD_H + 28 + PAD);
  return frame;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function getShadeSteps(shadeCount, naming) {
  var count = shadeCount === 'compact' ? 8 : shadeCount === 'system' ? 11 : 10;
  var s = [];
  if (naming === 'step1') {
    for (var i = 1; i <= count; i++) s.push(i);
  } else if (naming === 'step100') {
    for (var i = 1; i <= count; i++) s.push(i * 100);
  } else {
    for (var i = 1; i <= count; i++) s.push(i * 50);
  }
  return s;
}

// ── Ant Design palette algorithm ──────────────────────────────────────────────

// Per-step adjustments (from @ant-design/colors source)
var ANT_HUE_STEP  = 2;     // degrees of hue rotation per step
var ANT_SAT_LIGHT = 0.20;  // saturation decrease per lighter step (higher = lighter/airier light shades)
var ANT_VAL_LIGHT = 0.08;  // brightness increase per lighter step (higher = lighter light shades)
var ANT_SAT_DARK  = 0.05;  // saturation increase per darker step
var ANT_VAL_DARK  = 0.22;  // brightness decrease per darker step — power-curved so 500→600 gets largest drop

// Dark palette V-ramp bounds (direct HSV generation, no background blending)
var DARK_V_MIN = 0.13;  // darkest shade (100)
var DARK_V_MAX = 0.88;  // lightest shade (900/950)

// Light palette — HSV with ±2° hue rotation and Ant Design sat/val steps.
// isNeutral: force shade 50 to pure white (no hue tint for gray scales).
function buildLightShades(hex, steps, isNeutral) {
  var rgb = hexToRgbArray(hex);
  var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  var baseH = hsv.h, baseS = hsv.s, baseV = hsv.v;
  var n = steps.length;

  var baseIdx = Math.floor(n / 2);

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
      outV = Math.max(0.13, baseV - ANT_VAL_DARK * Math.pow(d2, 0.75));
    }

    var out = hsvToRgb(outH, Math.max(0, Math.min(1, outS)), Math.max(0, Math.min(1, outV)));
    return { step: step, rgb: { r: out.r / 255, g: out.g / 255, b: out.b / 255 } };
  });
}

// Dark palette — direct HSV ramp, same hue/sat logic as light palette.
// t=0 = darkest shade (100), t=1 = lightest shade (900/950).
// V steps are evenly spaced via a mild power curve — no background blending.
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

  var rgb = hexToRgbArray(hex);
  var hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  var baseH = hsv.h, baseS = hsv.s;
  var hueDir = (baseH >= 60 && baseH <= 240) ? -1 : 1;
  // Anchor: shade 500 equivalent sits at ~40% into the dark scale
  var baseIdx = Math.round(n * 0.4);

  return steps.map(function(step, i) {
    var t = i / Math.max(1, n - 1);

    // V: power-curve ramp gives ~0.08–0.10 V step between every adjacent pair
    var v = DARK_V_MIN + (DARK_V_MAX - DARK_V_MIN) * Math.pow(t, 0.9);

    // S: slightly boosted at dark end, tapers toward bright end
    var s = Math.max(0.40, Math.min(1.0, baseS + 0.06 - 0.22 * t));

    // H: ±2° rotation per step from baseIdx. Sign matches light palette lighter-step direction:
    // warm hues rotate toward orange (H+), cool hues rotate toward cyan (H−).
    // Previous sign was inverted, pushing warm colors (red, yellow) into the pink/magenta sector.
    var d = i - baseIdx;
    var h = (baseH + hueDir * ANT_HUE_STEP * d + 360) % 360;

    var out = hsvToRgb(h, s, v);
    return { step: step, rgb: { r: out.r / 255, g: out.g / 255, b: out.b / 255 } };
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

function getOrCreateCollection(name, cache) {
  var collections = cache.collections;
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === name) return collections[i];
  }
  var c = figma.variables.createVariableCollection(name);
  collections.push(c);
  return c;
}

function getOrCreateVariable(name, collection, type, overwrite, cache) {
  var arr = cache.vars[type] || (cache.vars[type] = []);
  for (var i = 0; i < arr.length; i++) {
    if (arr[i].name === name && arr[i].variableCollectionId === collection.id) {
      arr[i].__existed = true;
      return arr[i];
    }
  }
  var v = figma.variables.createVariable(name, collection, type);
  v.__existed = false;
  arr.push(v);
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
