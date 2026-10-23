/* ==========================================================================
   SOS Catalog Concepts — GLSL sources for SOSGlobe
   Kept deliberately light for fast ANGLE/D3D compiles: noise is texture-based, craters come
   from a generated tileable map, and Earth vs. planetary-body shaders are separate programs.
   ========================================================================== */
(function () {
  'use strict';
  const SOS = window.SOS;

  const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aLL;
uniform mat4 uProj;
uniform mat3 uRot;
uniform float uDist;
uniform float uMorph;
uniform vec4 uFlat;        // x: scale (view units / proj unit), y: lon0, z: lat0 projected Y, w: tile
uniform int uProjType;
out vec2 vLL;
out vec3 vN;

vec2 projFlat(float lam, float phi){
  if (uProjType == 1) {
    float p2 = phi*phi, p4 = p2*p2;
    float x = lam * (0.8707 - 0.131979*p2 + p4*(-0.013791 + p4*(0.003971*p2 - 0.001529*p4)));
    float y = phi * (1.007226 + p2*(0.015085 + p4*(-0.044475 + 0.028874*p2 - 0.005916*p4)));
    return vec2(x, y);
  } else if (uProjType == 2) {
    float ph = clamp(phi, -1.4835, 1.4835);
    return vec2(lam, log(tan(0.7853982 + 0.5*ph)));
  }
  return vec2(lam, phi);
}
void main(){
  float lon = aLL.x, lat = aLL.y;
  vec3 s = vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon));
  vec3 g = uRot * s;
  float lam = lon - uFlat.y + 6.28318530718 * uFlat.w;
  vec2 xy = projFlat(lam, lat);
  xy.y -= uFlat.z;
  vec3 f = vec3(xy * uFlat.x, 0.0);
  vec3 p = mix(g, f, uMorph);
  vLL = aLL;
  vN = g;
  gl_Position = uProj * vec4(p.x, p.y, p.z - uDist, 1.0);
}`;

  const FRAG_HEAD = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vLL;
in vec3 vN;
out vec4 fragColor;

uniform sampler2D uRelief;
uniform sampler2D uMask;
uniform sampler2D uLights;
uniform sampler2D uRamp;
uniform sampler2D uNoise;
uniform sampler2D uCraters;
uniform float uTime;
uniform float uT;
uniform float uMorph;
uniform int uProjType;

uniform int uStyle;            // 0 photo, 1 flat, 2 duotone, 3 dots
uniform vec3 uOcean;
uniform vec3 uOcean2;
uniform vec3 uLand;
uniform vec3 uLand2;
uniform vec3 uCoast;
uniform vec3 uGridC;
uniform float uCoastAmt;
uniform float uGrid;
uniform float uGridStep;
uniform float uExposure;
uniform float uSat;
uniform float uGamma;
uniform int uLightMode;        // 0 none, 1 headlight, 2 sun
uniform vec2 uSun;             // subsolar lon,lat (rad)
uniform float uNight;
uniform float uNightLights;
uniform vec3 uAtmo;
uniform float uAtmoAmt;

uniform int uField;
uniform float uLayerOpacity;
uniform vec2 uSrc;
uniform float uSeed;

uniform int uBody;
uniform vec3 uBA;
uniform vec3 uBB;
uniform vec3 uBC;
uniform vec4 uBP;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float wrapd(float x){ return x - TAU*floor((x + PI)/TAU); }
vec3 sph(float lon, float lat){ return vec3(cos(lat)*sin(lon), sin(lat), cos(lat)*cos(lon)); }

/* ---------- texture-based noise (cheap to compile, cheap to run) ---------- */
float h1(vec3 p){
  ivec2 q = ivec2(mod(floor(p.xy) + floor(p.z)*vec2(37.0, 17.0), 256.0));
  return texelFetch(uNoise, q, 0).r;
}
vec3 h3(vec3 p){ return vec3(h1(p), h1(p + vec3(17.3, 3.1, 9.7)), h1(p + vec3(5.9, 23.3, 1.7))); }
float noise3(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f*f*(3.0 - 2.0*f);
  vec2 uv = (i.xy + vec2(37.0, 17.0)*i.z) + f.xy;
  vec2 ab = texture(uNoise, (uv + 0.5)/256.0).rg;
  return mix(ab.r, ab.g, f.z);
}
float fbm(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++){ s += a*(noise3(p) - 0.5); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s*1.9;
}
float fbm3(vec3 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 3; i++){ s += a*(noise3(p) - 0.5); p = p*2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s*1.9;
}
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec4 ramp(float v){ return texture(uRamp, vec2(clamp(v, 0.0, 1.0), 0.5)); }
`;

  const FRAG_BODIES = `
/* ---------- planetary bodies ---------- */
vec3 craterTri(vec3 p, float scale){
  vec3 w = pow(abs(p), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 a = texture(uCraters, p.yz*scale).rgb;
  vec3 b = texture(uCraters, p.zx*scale + 0.37).rgb;
  vec3 c = texture(uCraters, p.xy*scale + 0.71).rgb;
  return a*w.x + b*w.y + c*w.z;
}
vec3 bodyColor(vec3 sp, float lon, float lat, out float emissive){
  emissive = 0.0;
  int fam = uBody;
  vec3 A = uBA, B = uBB, C = uBC;
  float seed = uSeed;
  if (fam == 1) {                                  // rock
    float large = fbm(sp*1.7 + seed);
    float maria = smoothstep(0.02, 0.2, large) * uBP.z;
    vec3 col = mix(A, B, maria*0.85);
    if (uBP.y > 0.5) col = mix(B, A, smoothstep(-0.25, 0.25, sp.x*cos(seed) + sp.z*sin(seed)));
    col *= 0.9 + 0.2*fbm(sp*14.0);
    vec3 c1 = craterTri(sp, 0.9);
    vec3 c2 = craterTri(sp + 1.3, 2.7);
    vec3 c3 = craterTri(sp + 2.9, 7.0);
    float bowl = clamp(max(max(c1.r, c2.r*0.9), c3.r*0.75)*uBP.x, 0.0, 1.0);
    float rim = clamp(max(max(c1.g, c2.g*0.9), c3.g*0.75)*uBP.x, 0.0, 1.0);
    col = mix(col, col*0.6, bowl*0.6);
    col += rim*0.16*(C + 0.2);
    if (uBP.w > 0.5 && uBP.w < 1.5) { float spot = smoothstep(0.92, 0.99, h1(floor(sp*34.0))); col = mix(col, vec3(1.0, 0.98, 0.94), spot*0.9*smoothstep(0.15, 0.55, fbm(sp*3.0 + seed) + 0.3)); }
    if (uBP.w > 1.5) { float cap = smoothstep(0.95, 1.2, lat); col = mix(col, vec3(0.45, 0.2, 0.15), cap*0.7); }
    return col;
  }
  if (fam == 2) {                                  // Mars
    float large = fbm(sp*2.4 + seed);
    vec3 col = mix(A, B, smoothstep(-0.02, 0.2, large)*0.65);
    col *= 0.88 + 0.28*fbm(sp*10.0);
    vec3 c2 = craterTri(sp, 2.7);
    col = mix(col, col*0.78, c2.r*0.45); col += c2.g*0.06;
    float vm = exp(-pow((lat + 0.12 + 0.03*sin(lon*6.0))/0.028, 2.0)) * smoothstep(-1.5, -1.1, lon) * smoothstep(-0.45, -0.85, lon);
    col = mix(col, B*0.55, vm*0.8);
    col = mix(col, C, smoothstep(1.28, 1.36, abs(lat) + 0.07*fbm(sp*6.0)));
    return col;
  }
  if (fam == 3) {                                  // Venus
    vec3 q = sp*vec3(1.0, 1.8, 1.0)*1.8;
    float warp = fbm3(q*1.4 + vec3(uTime*0.01, 0.0, 0.0));
    float n = fbm(q*2.4 + warp*2.2 + vec3(0.0, 0.0, uTime*0.012));
    vec3 col = mix(B, A, 0.5 + 0.9*n);
    return mix(col, C, smoothstep(0.1, 0.45, n)*0.45);
  }
  if (fam == 4) {                                  // gas giants
    float freq = 9.0 + 14.0*uBP.y;
    float turb = fbm(vec3(lon*1.8, lat*7.0, seed) + vec3(0.0, 0.0, uTime*0.01));
    float zone = 0.5 + 0.5*sin(lat*freq + turb*(1.6 + 1.8*uBP.y)*2.0);
    vec3 col = mix(B, A, zone);
    col = mix(col, C, smoothstep(0.55, 1.0, 0.5 + 0.8*fbm(vec3(lon*3.0, lat*14.0, seed + 2.0)))*0.55*uBP.z);
    col *= 0.94 + 0.12*fbm(sp*26.0);
    if (uBP.w > 0.5 && uBP.w < 1.5) {              // Great Red Spot
      vec2 d = vec2(wrapd(lon + 0.9)/0.26, (lat + 0.4)/0.13);
      float spot = exp(-dot(d, d)*1.8);
      col = mix(col, vec3(0.72, 0.28, 0.18), spot*0.9);
    }
    if (uBP.w > 1.5) {                              // Neptune dark spot
      vec2 d = vec2(wrapd(lon - 1.2)/0.22, (lat + 0.35)/0.11);
      col = mix(col, vec3(0.03, 0.06, 0.28), exp(-dot(d, d)*1.8)*0.9);
    }
    return col;
  }
  if (fam == 5) {                                  // icy moons / dwarf planets
    float n = fbm(sp*2.2 + seed);
    vec3 col = mix(A, C, 0.5 + 0.55*n);
    float r1 = 1.0 - abs(noise3(sp*3.0 + seed)*2.0 - 1.0);
    float r2 = 1.0 - abs(noise3(sp*7.0 + seed*1.7)*2.0 - 1.0);
    float lines = smoothstep(0.9, 0.99, r1)*0.9 + smoothstep(0.94, 0.995, r2)*0.5;
    col = mix(col, B, lines*(uBP.y > 0.5 ? 0.0 : 0.85));
    if (uBP.y > 0.5) {                              // Enceladus tiger stripes
      float st = smoothstep(0.1, 0.0, abs(sin(lon*3.0)*0.04 + lat + 1.3 + 0.03*sin(lon*14.0))) * step(lat, -1.0);
      st += smoothstep(0.05, 0.0, abs(lat + 1.38 + 0.03*sin(lon*9.0)));
      col = mix(col, C, clamp(st, 0.0, 1.0)*0.9);
    }
    if (uBP.w > 0.5 && uBP.w < 1.5) { float cell = noise3(sp*13.0); col = mix(col, B, smoothstep(0.55, 0.9, cell)*0.4); }   // Triton
    if (uBP.w > 1.5) {                              // Pluto: heart + dark band
      vec2 d = vec2(wrapd(lon - 3.0)/0.55, (lat - 0.25)/0.45);
      col = mix(col, B, smoothstep(0.1, -0.4, lat + 0.15)*0.55*smoothstep(0.0, 0.5, fbm(sp*2.5 + 1.0) + 0.2));
      col = mix(col, C, exp(-dot(d, d)*1.6)*0.95);
    }
    vec3 c2 = craterTri(sp, 2.7); col = mix(col, col*0.85, c2.r*0.35);
    return col;
  }
  if (fam == 6) {                                  // Io
    float n = fbm(sp*2.6 + seed);
    vec3 col = mix(A, B, smoothstep(-0.1, 0.25, n));
    col = mix(col, vec3(1.0, 0.96, 0.8), smoothstep(0.1, 0.35, fbm(sp*4.0 + 9.0))*0.3);
    col = mix(col, C, smoothstep(0.34, 0.44, fbm(sp*6.5 + 4.0))*0.92);
    float vents = smoothstep(0.93, 0.985, h1(floor(sp*22.0)))*0.9;
    return mix(col, vec3(1.0, 0.45, 0.1), vents*0.4);
  }
  if (fam == 7) {                                  // Titan
    float n = fbm(sp*2.0 + seed);
    vec3 col = mix(B, A, 0.55 + n*0.9);
    col = mix(col, C, smoothstep(0.1, 0.5, abs(lat))*0.25*(0.6 + n));
    return col*(0.96 + 0.08*fbm(sp*9.0));
  }
  if (fam == 8) {                                  // Sun
    emissive = 1.0;
    float gran = 1.0 - abs(noise3(sp*34.0 + vec3(0.0, 0.0, uTime*0.12))*2.0 - 1.0);
    gran = 0.5*gran + 0.5*(fbm(sp*26.0 + vec3(0.0, 0.0, uTime*0.08)) + 0.5);
    float mu = clamp(normalize(vN).z, 0.0, 1.0);
    vec3 col = mix(A, B, 0.3 + 0.6*gran);
    float spot = smoothstep(0.26, 0.4, fbm(sp*3.4 + seed))*smoothstep(0.55, 0.0, abs(lat));
    col = mix(col, C, spot*0.88);
    col += B*smoothstep(0.35, 0.8, fbm(sp*5.0 + vec3(0.0, uTime*0.02, 0.0)) + 0.4)*0.14;
    col *= mix(1.0, 0.35 + 0.65*pow(mu, 0.5), 1.0 - uMorph);
    return col;
  }
  if (fam == 9) {                                  // exoplanet (artist-concept style)
    float n = fbm(sp*2.6 + seed);
    vec3 col = mix(B, A, 0.5 + 1.1*n);
    col = mix(col, C, smoothstep(1.15, 1.35, abs(lat) + 0.1*fbm(sp*5.0))*0.9);
    float cl = smoothstep(0.1, 0.5, fbm(sp*3.4 + vec3(uTime*0.01, 0.0, seed)) + 0.2);
    return mix(col, C, cl*0.4);
  }
  if (fam == 10) {                                 // CMB
    emissive = 1.0;
    float v = fbm(sp*2.6 + seed)*0.8 + fbm(sp*7.0 + seed)*0.55 + fbm(sp*19.0 + seed)*0.35;
    v = clamp(0.5 + v*1.2, 0.0, 1.0);
    return v < 0.5 ? mix(A, B, v*2.0) : mix(B, C, (v - 0.5)*2.0);
  }
  // 11: Milky-way panorama
  emissive = 1.0;
  vec3 bn = normalize(vec3(0.0, 0.89, 0.46));
  float b = dot(sp, bn);
  float glow = exp(-b*b*28.0);
  float dust = fbm(sp*6.0 + seed) + 0.3;
  vec3 col = A + B*glow*(0.55 + 0.9*(fbm(sp*3.0) + 0.4))*0.95;
  col = mix(col, C, glow*smoothstep(0.1, 0.5, fbm(sp*2.0 + 4.0) + 0.3)*0.5);
  col *= 1.0 - smoothstep(0.05, 0.35, dust)*glow*0.65;
  vec3 gp = sp*70.0; vec3 cell = floor(gp); float hh = h1(cell);
  float star = smoothstep(0.35, 0.0, length(fract(gp) - 0.5 - (h3(cell) - 0.5)*0.6)) * step(0.985 - glow*0.04, hh);
  col += star*(0.6 + 0.8*h1(cell + 7.0));
  return col;
}
`;

  const FRAG_FIELDS = `
/* ---------- Earth data layers (illustrative) ---------- */
const vec4 AER[9] = vec4[9](
  vec4(-5.0, 20.0, 30.0, 10.0), vec4(-34.0, 16.0, 24.0, 8.0), vec4(82.0, 25.0, 16.0, 7.0),
  vec4(114.0, 32.0, 14.0, 9.0), vec4(22.0, -8.0, 14.0, 9.0), vec4(-58.0, -10.0, 10.0, 7.0),
  vec4(108.0, 58.0, 24.0, 6.0), vec4(-92.0, 38.0, 14.0, 6.0), vec4(47.0, 26.0, 10.0, 6.0));

vec4 layerField(int f, vec3 sp, float lon, float lat, float land, vec3 relief, vec2 uv, float t, float time, out float emis){
  emis = 0.0;
  float ocean = 1.0 - land;
  float s = TAU*t;
  float deg = 57.29578;
  if (f == 1) {                                    // SST
    float v = pow(max(cos(lat), 0.0), 2.7)*0.97;
    v += 0.06*sin(s - 1.6)*sin(lat);
    v += 0.11*exp(-pow((lat - 0.08)/0.30, 2.0))*exp(-pow(wrapd(lon - 2.3)/0.7, 2.0))*(1.0 + 0.4*sin(s));
    v -= 0.15*exp(-pow(lat/0.2, 2.0))*exp(-pow(wrapd(lon + 1.95)/0.85, 2.0))*(1.0 - 0.9*sin(s*2.0));
    v += 0.09*exp(-pow((lat - 0.62)/0.13, 2.0))*exp(-pow(wrapd(lon + 1.3)/0.45, 2.0));
    v += 0.05*fbm(sp*4.5 + vec3(0.0, 0.0, t*2.0));
    v = clamp(v + 0.03, 0.0, 1.0);
    vec4 c = ramp(v); return vec4(c.rgb, c.a*ocean);
  }
  if (f == 2) {                                    // temperature anomaly
    float amp = (0.32 + 0.95*pow(abs(sin(lat)), 1.6))*(0.72 + 0.28*land);
    float patt = 0.15 + 1.6*(fbm(sp*2.8 + 3.0) + 0.3);
    float v = 0.5 + 0.5*clamp(0.02 + t*(amp*patt - 0.22) - 0.3*t*exp(-pow((lat - 0.96)/0.17, 2.0))*exp(-pow(wrapd(lon + 0.6)/0.4, 2.0)), -1.0, 1.0);
    vec4 c = ramp(v); return vec4(c.rgb, 0.8);
  }
  if (f == 3) {                                    // clouds
    float lon2 = lon + time*0.008*(1.0 + cos(lat)) + t*0.5;
    vec3 q = sph(lon2, lat);
    float itcz = exp(-pow(lat/0.14, 2.0));
    float mid = exp(-pow((abs(lat) - 0.88)/0.3, 2.0));
    float sub = exp(-pow((abs(lat) - 0.42)/0.17, 2.0));
    float band = 0.28 + 0.5*itcz + 0.55*mid - 0.22*sub;
    float n = fbm(q*3.1 + vec3(0.0, 0.0, time*0.004)) + 0.55;
    float fine = fbm3(q*9.0 + 5.0)*0.5;
    float thr = 0.72 - 0.42*band;
    float d = smoothstep(thr, thr + 0.26, n + fine);
    float thick = smoothstep(thr + 0.15, thr + 0.6, n + fine);
    vec3 c = mix(vec3(0.80, 0.85, 0.93), vec3(1.0), thick);
    return vec4(c, d*0.93);
  }
  if (f == 4) {                                    // precipitation
    float itcz = exp(-pow((lat - 0.1*sin(s))/0.11, 2.0));
    float storm = exp(-pow((abs(lat) - 0.85)/0.2, 2.0))*0.75;
    float mons = exp(-pow((lat - 0.35)/0.2, 2.0))*exp(-pow(wrapd(lon - 1.55)/0.5, 2.0))*(0.5 + 0.5*sin(s - 0.3))*1.3;
    float amaz = exp(-pow((lat + 0.05)/0.15, 2.0))*exp(-pow(wrapd(lon + 1.1)/0.4, 2.0))*0.6;
    float n = fbm(sp*5.5 + vec3(time*0.015, 0.0, t)) + 0.5;
    float v = (itcz + storm + mons + amaz)*smoothstep(0.32, 0.78, n)*1.25;
    return ramp(v);
  }
  if (f == 5) {                                    // aerosols
    float v = 0.0;
    float sh = time*0.15;
    for (int i = 0; i < 9; i++) {
      vec4 a = AER[i];
      float dx = wrapd((lon - (a.x + (i < 2 ? -sh*(i == 1 ? 1.0 : 0.4) : 0.0))/deg))*deg/a.z;
      float dy = (lat*deg - a.y)/a.w;
      float st = (i == 4 || i == 5) ? (0.55 + 0.45*sin(s - 1.2)) : (i == 6) ? (0.4 + 0.6*sin(s - 1.4)) : 1.0;
      v += exp(-(dx*dx + dy*dy))*st;
    }
    v *= 0.45 + 1.1*(fbm(sp*3.6 + vec3(time*0.01, 0.0, 0.0)) + 0.5);
    v *= 0.5;
    return ramp(v);
  }
  if (f == 6) {                                    // CO2
    float v = 0.42 + 0.3*sin(lat) + 0.08*sin(s)*sin(lat);
    v += 0.14*exp(-pow((lat - 0.65)/0.18, 2.0))*exp(-pow(wrapd(lon - 1.9)/0.5, 2.0));
    v += 0.1*exp(-pow((lat - 0.7)/0.18, 2.0))*exp(-pow(wrapd(lon - 0.1)/0.5, 2.0));
    v += 0.09*exp(-pow((lat - 0.68)/0.18, 2.0))*exp(-pow(wrapd(lon + 1.4)/0.5, 2.0));
    v += 0.22*fbm(sp*3.2 + vec3(t, 0.0, time*0.01));
    v += 0.1*t;
    vec4 c = ramp(v); return vec4(c.rgb, 0.74);
  }
  if (f == 7) {                                    // sea ice
    float nEdge = (76.0 + 6.0*sin(TAU*(t - 0.45)))/deg;
    float sEdge = (64.0 + 5.0*sin(TAU*(t - 0.95)))/deg;
    float edge = lat > 0.0 ? nEdge : sEdge;
    float n = fbm(sp*5.0 + 2.0)*0.12;
    float v = smoothstep(edge - 0.02 + n, edge + 0.12 + n, abs(lat) + n*0.5);
    vec4 c = ramp(v); return vec4(c.rgb, c.a*ocean);
  }
  if (f == 8) {                                    // bathymetry
    float d = 1.0 - smoothstep(0.03, 0.34, lum(relief));
    float v = clamp(d + 0.02*fbm(sp*10.0), 0.0, 1.0);
    vec4 c = ramp(v);
    return vec4(c.rgb, ocean*0.96);
  }
  if (f == 9) {                                    // vegetation
    float nd = (relief.g - relief.r)/(relief.g + relief.r + 0.06);
    float v = clamp(nd*2.6 + 0.36 + 0.12*sin(s - 1.0)*sin(lat) + 0.05*fbm(sp*8.0), 0.0, 1.0);
    vec4 c = ramp(v); return vec4(c.rgb, land*0.97);
  }
  if (f == 10) {                                   // chlorophyll
    float o = 0.012;
    float m2 = (texture(uMask, uv + vec2(o, 0.0)).r + texture(uMask, uv - vec2(o, 0.0)).r + texture(uMask, uv + vec2(0.0, o*2.0)).r + texture(uMask, uv - vec2(0.0, o*2.0)).r)*0.25;
    float near = clamp((0.502 - m2)/0.05, 0.0, 1.0);
    float hi = exp(-pow((abs(lat) - 0.95)/0.28, 2.0))*(0.55 + 0.45*sin(s*(lat > 0.0 ? 1.0 : -1.0) - 1.4));
    float up = exp(-pow((lat + 0.15)/0.3, 2.0))*exp(-pow(wrapd(lon + 1.6)/0.25, 2.0))*0.8 + exp(-pow((lat - 0.15)/0.3, 2.0))*exp(-pow(wrapd(lon + 0.3)/0.15, 2.0))*0.5;
    float gyre = exp(-pow((abs(lat) - 0.42)/0.22, 2.0))*0.35;
    float v = 0.2 + 0.38*near + 0.42*hi + 0.4*up - gyre + 0.22*fbm(sp*5.5 + t);
    vec4 c = ramp(v); return vec4(c.rgb, ocean*0.96);
  }
  if (f == 11) {                                   // population density (night-lights proxy)
    float l = textureLod(uLights, uv, 1.0).r;
    float v = smoothstep(0.035, 0.5, pow(l, 0.75))*(0.65 + 0.55*t);
    vec4 c = ramp(v); return vec4(c.rgb, c.a*land);
  }
  if (f == 12) {                                   // tsunami wave propagation
    vec3 src = sph(uSrc.x, uSrc.y);
    float ang = acos(clamp(dot(sp, src), -1.0, 1.0));
    float front = t*2.85;
    float w = 0.035 + 0.012*front;
    float env = exp(-pow((ang - front)/w, 2.0));
    float tail = exp(-pow((ang - front*0.9 + 0.1)/(w*1.7), 2.0))*0.55;
    float decay = 1.0/(1.0 + 1.5*ang);
    float dir = 0.6 + 0.4*cos(2.0*atan(sp.y - src.y, sp.x - src.x) + 0.8);
    float v = (env + tail)*decay*2.6*dir;
    vec4 c = ramp(v);
    float a = c.a*ocean*step(ang, front + 0.15);
    a = max(a, ocean*step(ang, front)*0.14);
    return vec4(mix(c.rgb, vec3(0.45, 0.8, 1.0), step(v, 0.02)), a);
  }
  if (f == 13) {                                   // ozone
    float size = 0.1 + 0.36*exp(-pow((t - 0.72)/0.17, 2.0));
    float d = abs(lat + 1.5708);
    float inside = smoothstep(size, size*0.55, d);
    float v = 0.64 + 0.08*sin(lat*2.0) - 0.52*inside + 0.07*fbm(sp*3.0 + t);
    vec4 c = ramp(v); return vec4(c.rgb, 0.6);
  }
  if (f == 14) {                                   // aurora
    emis = 1.0;
    vec3 pn = sph(-1.256, 1.403);
    vec3 ps = sph(1.885, -1.396);
    float aN = acos(clamp(dot(sp, pn), -1.0, 1.0));
    float aS = acos(clamp(dot(sp, ps), -1.0, 1.0));
    float ang = min(aN, aS);
    vec3 pc = aN < aS ? pn : ps;
    vec3 e1 = normalize(cross(pc, vec3(0.0, 1.0, 0.0)));
    vec3 e2 = cross(pc, e1);
    float azi = atan(dot(sp, e2), dot(sp, e1));
    float ring = exp(-pow((ang - 0.37)/0.075, 2.0));
    float cur = 0.5 + 0.5*sin(azi*7.0 + fbm(sp*6.0)*4.0 + time*0.4);
    float v = ring*(0.62 + 0.55*cur)*(0.85 + 0.25*sin(time*0.3 + azi*3.0));
    vec4 c = ramp(v); return vec4(c.rgb, clamp(v, 0.0, 1.0));
  }
  if (f == 15) {                                   // magnetic field
    vec3 pole = sph(-1.2677, 1.4033);
    float sm = dot(sp, pole);
    float v = (sqrt(1.0 + 3.0*sm*sm) - 1.0) + 0.03*fbm(sp*3.0 + t);
    float k = v*14.0;
    float line = 1.0 - smoothstep(0.0, fwidth(k)*1.3 + 0.001, abs(fract(k) - 0.5));
    vec4 c = ramp(v*0.95);
    return vec4(mix(c.rgb, vec3(1.0), line*0.6), 0.5 + 0.2*line);
  }
  if (f == 16) {                                   // insolation
    vec3 sun = sph(uSun.x, uSun.y);
    float d = dot(sp, sun);
    vec4 c = ramp(clamp(d, 0.0, 1.0));
    return vec4(c.rgb, c.a*smoothstep(0.0, 0.08, d)*0.72);
  }
  if (f == 18) {                                   // topography tint
    float l = lum(relief);
    float v = land > 0.5 ? 0.5 + clamp((l - 0.16)*1.1, 0.0, 0.5) : clamp(l*1.35, 0.0, 0.48);
    vec4 c = ramp(v); return vec4(c.rgb, 0.82);
  }
  if (f == 19) {                                   // wind speed
    float v = 0.22 + 0.55*exp(-pow((abs(lat) - 0.82)/0.22, 2.0)) + 0.2*(fbm(sp*3.0 + vec3(time*0.02, 0.0, 0.0)) + 0.5);
    vec4 c = ramp(v); return vec4(c.rgb, c.a*0.75);
  }
  if (f == 20) {                                   // ocean currents speed
    float v = 0.18 + 0.7*exp(-pow((lat - 0.55)/0.1, 2.0))*exp(-pow(wrapd(lon + 1.3)/0.5, 2.0)) + 0.55*exp(-pow((lat - 0.52)/0.1, 2.0))*exp(-pow(wrapd(lon - 2.4)/0.4, 2.0)) + 0.4*exp(-pow((lat + 0.95)/0.12, 2.0)) + 0.3*exp(-pow(lat/0.12, 2.0)) + 0.18*(fbm(sp*5.0 + vec3(time*0.01, 0.0, 0.0)) + 0.5);
    vec4 c = ramp(v); return vec4(c.rgb, c.a*ocean*0.8);
  }
  if (f == 21) {                                   // fires
    emis = 1.0;
    float ph = sin(s)*0.5 + 0.5;
    float belt = exp(-pow((lat - (0.12 - 0.3*(ph - 0.5)))/0.16, 2.0))*0.9 + exp(-pow((lat + 0.2 - 0.18*ph)/0.2, 2.0))*0.55*ph;
    belt *= smoothstep(-0.4, 0.8, fbm(sp*2.5 + 6.0)*2.0);
    belt += 0.5*exp(-pow((lat - 1.0)/0.16, 2.0))*exp(-pow(wrapd(lon - 1.9)/0.5, 2.0))*ph;
    belt += 0.4*exp(-pow((lat - 0.62)/0.1, 2.0))*exp(-pow(wrapd(lon + 2.0)/0.12, 2.0))*ph;
    vec2 g = vec2(lon, lat)*deg*2.4;
    vec2 id = floor(g); vec2 fr = fract(g) - 0.5;
    float hh = h1(vec3(id, uSeed));
    float on = step(1.0 - belt*land*0.34, hh);
    float fl = 0.65 + 0.35*sin(time*5.0 + hh*60.0);
    float dotv = on*smoothstep(0.55, 0.05, length(fr))*fl;
    vec4 c = ramp(0.2 + 0.8*hh);
    return vec4(c.rgb, clamp(dotv, 0.0, 1.0));
  }
  if (f == 22) {                                   // ocean pH
    float v = 0.92 - 0.75*t*(0.65 + 0.35*cos(lat)) - 0.25*(1.0 - cos(lat)) + 0.1*fbm(sp*4.0);
    vec4 c = ramp(v); return vec4(c.rgb, ocean*0.66);
  }
  return vec4(0.0);
}
`;

  const MAIN_COMMON_TAIL = `
  // limb shading + rim atmosphere (globe only)
  float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.6);
  col = mix(col, col*0.78, rim*0.25*(1.0 - uMorph));
  col += uAtmo*rim*uAtmoAmt*(1.0 - uMorph)*(uBody == 8 ? 0.2 : 1.0);
  fragColor = vec4(col, 1.0);
}
`;

  const FRAG_MAIN_EARTH = `
float dotsPattern(float lon, float lat, float stepRad, out vec2 center){
  float row = floor((lat + 1.5707963)/stepRad + 0.5);
  float latc = row*stepRad - 1.5707963;
  float circ = mix(max(cos(latc), 0.012), 1.0, uMorph);     // flat map: uniform grid (no polar moire)
  float n = max(1.0, floor(TAU*circ/stepRad + 0.5));
  float colw = TAU/n;
  float colIdx = floor((lon + PI)/colw + 0.5);
  float lonc = colIdx*colw - PI;
  center = vec2(lonc, latc);
  vec2 dd = vec2((lon - lonc)*circ, lat - latc);
  return length(dd);
}

void main(){
  float lon = vLL.x, lat = vLL.y;
  if (uProjType == 2 && uMorph > 0.5 && abs(lat) > 1.4835) discard;
  vec2 uv = vec2(lon/TAU + 0.5, 0.5 - lat/PI);
  vec3 n = normalize(vN);
  vec3 sp = sph(lon, lat);

  vec3 sunV = sph(uSun.x, uSun.y);
  float sdot = dot(sp, sunV);
  float light = 1.0;
  float day = 1.0;
  if (uLightMode == 1) {
    vec3 L = normalize(vec3(-0.42, 0.38, 0.82));
    light = 0.30 + 0.82*max(dot(n, L), 0.0);
    light = mix(light, 1.0, uMorph);
  } else if (uLightMode == 2) {
    day = smoothstep(-0.12, 0.22, sdot);
    light = mix(1.0 - uNight, 1.0, day);
    light *= mix(1.0, 0.92 + 0.12*max(n.z, 0.0), 1.0 - uMorph);
  }

  vec3 col;
  vec3 relief = texture(uRelief, uv).rgb;
  float m = texture(uMask, uv).r;
  float landF = clamp((0.396 - m)/0.05 + 0.5, 0.0, 1.0);
  landF = max(landF, smoothstep(-1.4835, -1.5, lat));
  float L = lum(relief);

  if (uStyle == 0) {                               // photo
    col = relief;
    col = mix(vec3(lum(col)), col, uSat);
    col = pow(max(col, vec3(0.0)), vec3(uGamma))*uExposure;
    col = mix(col, col*vec3(0.92, 1.0, 1.08), (1.0 - landF)*0.35);
  } else if (uStyle == 1) {                        // flat
    float depth = clamp(0.95 - L*2.4, 0.0, 1.0);
    vec3 oc = mix(uOcean, uOcean2, depth);
    vec3 lc = mix(uLand, uLand2, clamp((L - 0.15)*1.5, 0.0, 1.0));
    col = mix(oc, lc, landF);
    float coast = 1.0 - smoothstep(0.0, 0.05, abs(m - 0.396));
    col = mix(col, uCoast, coast*uCoastAmt*step(-1.45, lat));
  } else if (uStyle == 2) {                        // duotone
    vec3 oc = mix(uOcean, uOcean2, clamp(L*2.2, 0.0, 1.0));
    vec3 lc = mix(uLand, uLand2, clamp((L - 0.05)*1.7, 0.0, 1.0));
    col = mix(oc, lc, landF);
    float coast = 1.0 - smoothstep(0.0, 0.05, abs(m - 0.396));
    col = mix(col, uCoast, coast*uCoastAmt*step(-1.45, lat));
  } else {                                         // dots
    vec2 cc;
    float stp = 0.0245;
    float r = dotsPattern(lon, lat, stp, cc);
    vec2 cuv = vec2(cc.x/TAU + 0.5, 0.5 - cc.y/PI);
    float cm = textureLod(uMask, cuv, 2.0).r;
    float cl = clamp((0.396 - cm)/0.06 + 0.5, 0.0, 1.0);
    cl = max(cl, step(cc.y, -1.485));
    float px = length(fwidth(vec2(lon*cos(lat), lat)));
    float rad = stp*0.36;
    float disk = 1.0 - smoothstep(rad - px, rad + px, r);
    col = uOcean;
    col = mix(col, uLand, disk*cl);
    col = mix(col, uOcean2, disk*(1.0 - cl)*0.55);
    landF = cl;
  }

  // graticule
  if (uGrid > 0.001) {
    float gs = uGridStep;
    float a = lon*57.29578/gs, b = lat*57.29578/gs;
    float wa = fwidth(a)*0.9 + 0.0005, wb = fwidth(b)*0.9 + 0.0005;
    float lx = 1.0 - smoothstep(0.0, wa*1.2, abs(fract(a + 0.5) - 0.5));
    float ly = 1.0 - smoothstep(0.0, wb*1.2, abs(fract(b + 0.5) - 0.5));
    lx *= smoothstep(1.46, 1.2, abs(lat));
    col = mix(col, uGridC, max(lx, ly)*uGrid);
  }

  // data layer
  if (uField > 0) {
    float em;
    vec4 Lc = layerField(uField, sp, lon, lat, landF, relief, uv, uT, uTime, em);
    Lc.a *= uLayerOpacity;
    if (em > 0.5) {
      col = col*light;
      col += Lc.rgb*Lc.a*(uField == 21 ? 1.9 : 1.6);
      light = 1.0;
    } else {
      col = mix(col, Lc.rgb, Lc.a);
    }
  }
  // ocean specular glint (photo style)
  if (uStyle == 0) {
    vec3 Lh = normalize(vec3(-0.42, 0.38, 0.82));
    vec3 Hh = normalize(Lh + vec3(0.0, 0.0, 1.0));
    float spec = pow(max(dot(n, Hh), 0.0), 120.0)*(1.0 - landF)*(1.0 - uMorph)*0.2*(uLightMode == 2 ? day : 1.0);
    col += spec*vec3(0.85, 0.93, 1.0);
  }
  // night lights
  if (uNightLights > 0.5 && uField != 14) {
    vec3 lights = texture(uLights, uv).rgb;
    float nightMix = 1.0 - smoothstep(-0.05, 0.2, sdot);
    col = col*light + lights*vec3(1.7, 1.45, 1.1)*nightMix*uNightLights*1.35;
    light = 1.0;
  }
  col *= light;
` + MAIN_COMMON_TAIL;

  const FRAG_MAIN_BODY = `
void main(){
  float lon = vLL.x, lat = vLL.y;
  if (uProjType == 2 && uMorph > 0.5 && abs(lat) > 1.4835) discard;
  vec3 n = normalize(vN);
  vec3 sp = sph(lon, lat);
  float emissive;
  vec3 col = bodyColor(sp, lon, lat, emissive);
  if (emissive < 0.5) {
    vec3 Ld = normalize(vec3(-0.5, 0.35, 0.8));
    float shade = 0.12 + 0.95*pow(max(dot(n, Ld), 0.0), 0.85);
    col *= mix(shade, 1.0, uMorph);
  }
` + MAIN_COMMON_TAIL;

  const BG_VERT = `#version 300 es
precision highp float;
out vec2 vUV;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUV = p;
  gl_Position = vec4(p*2.0 - 1.0, 0.0, 1.0);
}`;
  const BG_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec2 uRes;
uniform vec2 uCenter;       // px
uniform float uRadius;      // px (projected globe radius)
uniform float uAtmoAmt;
uniform vec3 uAtmo;
uniform float uStars;
uniform float uMorph;
uniform vec2 uShift;
uniform float uTime;
float hash(vec2 p){ p = fract(p*vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y)*p.x); }
void main(){
  vec2 px = vUV*uRes;
  px.y = uRes.y - px.y;
  float r = length(px - uCenter);
  float rel = (r - uRadius)/uRadius;
  vec3 col = vec3(0.0); float a = 0.0;
  float glowAmt = uAtmoAmt*(1.0 - uMorph);
  if (glowAmt > 0.001 && rel > -0.02) {
    float g = exp(-max(rel, 0.0)*9.0)*0.55 + exp(-max(rel, 0.0)*28.0)*0.5;
    g *= smoothstep(-0.02, 0.01, rel);
    col += uAtmo*g*glowAmt; a += g*glowAmt;
  }
  if (uStars > 0.001) {
    vec2 sp = (px + uShift)/uRes.y*70.0;
    vec2 id = floor(sp); vec2 f = fract(sp) - 0.5;
    float h = hash(id);
    float off = hash(id + 7.3) - 0.5;
    float star = step(0.93, h) * smoothstep(0.16 + h*0.1, 0.0, length(f - vec2(off, hash(id + 3.1) - 0.5)*0.6));
    float tw = 0.75 + 0.25*sin(uTime*(1.0 + h*3.0) + h*40.0);
    float st = star*uStars*tw*(1.0 - smoothstep(0.0, 0.6, glowAmt*exp(-max(rel, 0.0)*4.0)));
    col += vec3(0.85, 0.92, 1.0)*st; a += st;
  }
  fragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

  SOS._glsl = { VERT, FRAG_HEAD, FRAG_BODIES, FRAG_FIELDS, FRAG_MAIN_EARTH, FRAG_MAIN_BODY, BG_VERT, BG_FRAG };
})();
