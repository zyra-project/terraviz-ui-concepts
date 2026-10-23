// Assigns an illustrative globe "layer kind" to each catalog record.
// The real catalog has no machine-readable layer type, so we infer one from the title, keywords and categories.
// Used only to decide which procedural visual the concepts show on the globe for a dataset.

const BODY_RULES = [
  [/\bsun\b|solar flare|sunspot|suvi|carrington|aia 193|aia 304|stereo\/sdo|solar synoptic|solar system to scale/i, 'body:sun'],
  [/saturn with rings/i, 'body:saturn'],
  [/titan\b/i, 'body:titan'],
  [/\bio\b/i, 'body:io'],
  [/europa/i, 'body:europa'],
  [/ganymede/i, 'body:ganymede'],
  [/callisto/i, 'body:callisto'],
  [/enceladus/i, 'body:enceladus'],
  [/mimas/i, 'body:mimas'],
  [/tethys/i, 'body:tethys'],
  [/dione/i, 'body:dione'],
  [/rhea/i, 'body:rhea'],
  [/iapetus/i, 'body:iapetus'],
  [/phoebe/i, 'body:phoebe'],
  [/miranda/i, 'body:miranda'],
  [/\bariel\b/i, 'body:ariel'],
  [/umbriel/i, 'body:umbriel'],
  [/titania/i, 'body:titania'],
  [/oberon/i, 'body:oberon'],
  [/triton/i, 'body:triton'],
  [/charon/i, 'body:charon'],
  [/pluto/i, 'body:pluto'],
  [/ceres/i, 'body:ceres'],
  [/vesta/i, 'body:vesta'],
  [/phobos/i, 'body:phobos'],
  [/deimos/i, 'body:deimos'],
  [/comet/i, 'body:comet'],
  [/exoplanet|trappist|kepler-/i, 'body:exo'],
  [/jupiter|great red spot|red spot junior/i, 'body:jupiter'],
  [/saturn/i, 'body:saturn'],
  [/uranus/i, 'body:uranus'],
  [/neptune/i, 'body:neptune'],
  [/venus/i, 'body:venus'],
  [/mercury/i, 'body:mercury'],
  [/\bmars\b|mars:|olympus mons|valles marineris/i, 'body:mars'],
  [/cosmic microwave|wmap/i, 'sky:cmb'],
  [/milky way|all sky|hubble|fornax|constellation|big bang/i, 'sky:milky'],
  [/moon|lunar|lroc|lola|apollo|landing sites/i, 'body:moon'],
];

// Name-only, highly specific rules (checked before everything else)
const NAME_FIRST = [
  [/^blue marble\s*(-\s*seasonal)?\s*$|^blue marble:\s*without|pale blue dot|borders|country names|continent names|capital city names|city names|ocean names|plate names|lat\/long|latitude longitude|coordinate system|sos locations|noaa logo|footprints|fractals|^largest|the next step|the wanderers|maps through history|land mask|land to sea|gray earth|goldilocks|^loop$|planet rotations|time zones/i, 'earth'],
  [/blue marble.*(topograph|bathymetr)/i, 'bathy'],
  [/blue marble.*seasonal/i, 'topo'],
  [/blue marble and nighttime|nighttime lights|terminator|light pollution|population density at night/i, 'lights'],
  [/blue marble: sea level/i, 'currents'],
  [/climate model.*precipitation/i, 'precip'],
  [/climate model.*sea ice/i, 'ice'],
  [/climate model.*sea surface temperature/i, 'sst'],
  [/climate model.*(surface temperature|temperature change)|climate model comparison/i, 'temp'],
  [/acidif|saturation state|surface ph/i, 'acid'],
  [/coral|bleaching|el nino|la nina/i, 'sst'],
  [/deep-sea vent|exploring the (depths|unknown)|marine sanctuaries|ocean adventure|undersea|multibeam|seafloor|etopo|bathymetr|mariana/i, 'bathy'],
  [/species richness|protecting wildlife|human influences on marine/i, 'veg'],
  [/solar (power|insolation|radiation)|insolation|albedo|uv index|eclipse/i, 'insol'],
  [/space trash|satellite|international space station|polar orbiting|swath/i, 'routes'],
  [/lightning/i, 'wind'],
  [/gfs.*surface temperature/i, 'temp'],
  [/fireworks|resilien/i, 'pop'],
  [/water cycle|dams|rivers|lakes|ocean drain|meander|water falls|world.s water|groundwater|blue planet/i, 'precip'],
  [/human statistics|energy|fukushima/i, 'energy'],
];

const EARTH_RULES = [
  [/tsunami/i, 'tsunami'],
  [/earthquake|seismic|plate (tectonic|boundar|movement)|volcano|ring of fire|hotspot|age of the seafloor|spreading|pangaea|paleogeograph|paleomap|tectonic|eruption/i, 'quakes'],
  [/hurricane|cyclone|typhoon|tropical storm|haiyan|sandy|tropical cyclones/i, 'storms'],
  [/ozone/i, 'ozone'],
  [/aurora|solar storm|space weather|magnetosphere/i, 'aurora'],
  [/magnet|compass|declination|isogonic/i, 'magnetic'],
  [/sea ice|snow|ice cover|ice age|glacier|ice sheet|greenland|cryosphere|frozen|ice cores|polar ice|arctic ocean|antarctic/i, 'ice'],
  [/sea surface temperature|\bsst\b|enso|ocean temperature|marine heat/i, 'sst'],
  [/chlorophyll|phytoplankton|ocean color|primary productivity|algal bloom|plankton|fisheries|fishing|squid|aquaculture/i, 'chloro'],
  [/fire|wildfire|burn|gas flares|slash and burn/i, 'fire'],
  [/aerosol|dust|smoke|air quality|particulate|black carbon|sulfate|soot|ash\b|ozone pollution|nitrogen dioxide|carbon monoxide|sea salt|atmospheric chemistry|chemistry/i, 'aerosol'],
  [/co2|carbon|greenhouse|emission|methane|fossil|fracking|natural gas|cfc|human era/i, 'co2'],
  [/ocean current|circulation|gyre|conveyor|thermohaline|eddy|garbage patch|marine debris|microplastic|plastic|argo|buoy|salinity|sea level|altimetry|sea surface height|wave|tides?|currents|rising sea/i, 'currents'],
  [/precip|rain|monsoon|atmospheric river|water vapor|flood|drought|hydrology|snowmelt|freshwater|tropical widening|madden/i, 'precip'],
  [/cloud|ir satellite|goes\b|goes-|geocolor|weather satellite|true color|infrared/i, 'clouds'],
  [/temperature|anomaly|global warming|warming stripes|ipcc|\bssp\b|heat island|climate zones|koppen|cop15|paleoclimate|climate science/i, 'temp'],
  [/wind|jet stream|gfs|forecast|weather model|weather prediction|pressure|500mb|cape\b|thunderstorm|tornado|severe weather|vorticity|extreme weather|weather/i, 'wind'],
  [/night|lights/i, 'lights'],
  [/renewable|wave power|wind power|energy revolution|energy planet|nuclear|radioactive|power plants|energy use/i, 'energy'],
  [/population|demograph|urban|cities|megacities|migration|immigration|emigration|life expectancy|health|disease|malaria|dengue|pandemic|h1n1|mortality|contraception|poverty|conflict|civil unrest|protest|violence|casualties|displacement|trade|globalization|economy|social|facebook|newspaper|television|wikipedia|medals|olympics|tourist|food|meat|dinner|indigenous|languages/i, 'pop'],
  [/air traffic|airplane|aviation|shipping|ships?\b|ports|railroad|roads|cars\b|transportation|tracks?\b|tracking|tracklines|orbit|route|cables|animal|tagging|turtle|shark|whale|seal\b|bird/i, 'routes'],
  [/vegetation|land cover|land use|agricultur|crop|farm|forest|biome|grassland|ecosystem|biosphere|habitat|biodiversity|species|photosynthesis|livestock|pasture|growth|deforest|ndvi|life/i, 'veg'],
  [/radiation|energy balance|seasons|solstice|equinox|time zones?|earth.s tilt|rotation|sidereal|solar day|day\/night/i, 'insol'],
  [/topograph|elevation|relief|landscape|hot topo|shaded relief|geodesy|earth shape/i, 'topo'],
];

function classify(d) {
  const name = d.name.trim();
  const text = [name, ...(d.keywords || []), ...Object.values(d.categories || {}).flat()].join(' | ');
  const cats = Object.keys(d.categories || {});
  const isSpace = cats.includes('Space');

  // 1) celestial bodies — only for Space-category records or when the name is explicit
  if (isSpace || /\b(moon|mars|venus|jupiter|saturn|pluto|neptune|uranus|milky way|exoplanet)\b/i.test(name)) {
    if (!/eclipse|aurora|magnetic|magnet|dscovr|satellite|space trash|space geodesy|instrumented|goldilocks|pale blue|planet rotations|weather satellites|goes-r|polar orbiting|iss\b|international space/i.test(name) || /moon transit/i.test(name)) {
      for (const [re, k] of BODY_RULES) if (re.test(name)) return k;
    }
  }
  // 2) name-first specific rules, then broad rules on the name, then on the whole text
  for (const [re, k] of NAME_FIRST) if (re.test(name)) return k;
  for (const [re, k] of EARTH_RULES) if (re.test(name)) return k;
  for (const [re, k] of EARTH_RULES) if (re.test(text)) return k;
  return 'earth';
}

module.exports = { classify };
