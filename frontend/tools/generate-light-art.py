from pathlib import Path
from math import sin, cos, pi, copysign
out=Path(__file__).resolve().parents[1] / 'dist' / 'assets'
def path(points):
 return 'M'+'L'.join(f'{x:.1f} {y:.1f}' for x,y in points)
def power(v,n): return copysign(abs(v)**n,v)
def project(x,y,z):
 # Isometric optical capsule: a rounded volume, not a globe.
 yaw=.58; pitch=-.26
 a=x*cos(yaw)+z*sin(yaw); b=-x*sin(yaw)+z*cos(yaw)
 c=y*cos(pitch)-b*sin(pitch); depth=y*sin(pitch)+b*cos(pitch)
 return 320+a*(1+depth/1500),245+c*(1+depth/1500)
paths=[]
for i in range(53):
 lat=-pi/2+.025+(pi-.05)*i/52
 points=[]
 for j in range(161):
  lon=2*pi*j/160
  points.append(project(155*power(cos(lat),.66)*power(cos(lon),.66),185*power(sin(lat),.66),130*power(cos(lat),.66)*power(sin(lon),.66)))
 paths.append(f'<path d="{path(points)}" opacity="{.21+.28*(i/52):.2f}"/>')
for i in range(27):
 lon=2*pi*i/27
 points=[project(155*power(cos(t),.66)*power(cos(lon),.66),185*power(sin(t),.66),130*power(cos(t),.66)*power(sin(lon),.66)) for t in [-pi/2+pi*j/120 for j in range(121)]]
 paths.append(f'<path d="{path(points)}" opacity=".19"/>')
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 500" fill="none"><defs><linearGradient id="light" x1="100" y1="100" x2="530" y2="360" gradientUnits="userSpaceOnUse"><stop stop-color="#5187ff"/><stop offset=".4" stop-color="#a0ceff"/><stop offset=".56" stop-color="#e4eaff"/><stop offset="1" stop-color="#9261f1"/></linearGradient><radialGradient id="halo"><stop stop-color="#537bff" stop-opacity=".18"/><stop offset="1" stop-color="#537bff" stop-opacity="0"/></radialGradient></defs><ellipse cx="320" cy="275" rx="275" ry="220" fill="url(#halo)"/><g stroke="url(#light)" stroke-width=".65">'''+''.join(paths)+'''</g></svg>'''
(out/'containment-field.svg').write_text(svg)
# A perspective landscape of precise optical fibres, tapering into black.
ridges=[]
for row in range(61):
 depth=row/60
 points=[]
 for col in range(181):
  u=col/180; x=-70+1340*u
  wave=sin(u*pi*3.2+depth*1.7)*(.28+.72*abs(2*u-1))
  y=85+depth**1.55*255 + wave*(20+65*depth) - sin(u*pi)*depth*70
  points.append((x,y))
 opacity=.09+.55*(1-depth)**.7
 ridges.append(f'<path d="{path(points)}" opacity="{opacity:.2f}"/>')
svg='''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" fill="none"><defs><linearGradient id="filament" x1="0" y1="0" x2="1200" y2="50" gradientUnits="userSpaceOnUse"><stop stop-color="#4068ee" stop-opacity=".15"/><stop offset=".22" stop-color="#669bff"/><stop offset=".46" stop-color="#b6dbff"/><stop offset=".58" stop-color="#c6bfff"/><stop offset=".8" stop-color="#a078ff"/><stop offset="1" stop-color="#643aba" stop-opacity=".15"/></linearGradient><radialGradient id="mist"><stop stop-color="#5967e4" stop-opacity=".24"/><stop offset="1" stop-color="#5967e4" stop-opacity="0"/></radialGradient></defs><ellipse cx="600" cy="160" rx="580" ry="150" fill="url(#mist)"/><g stroke="url(#filament)" stroke-width=".8">'''+''.join(ridges)+'''</g></svg>'''
(out/'light-terrain.svg').write_text(svg)
print('Created two original vector light sculptures.')
