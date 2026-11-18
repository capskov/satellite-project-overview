#!/usr/bin/env python3
"""Render agent-selected overview geometry to PNG and editable SVG (Pillow)."""
from pathlib import Path
import argparse, base64, html, io, json, math, os
from PIL import Image, ImageDraw, ImageFont, ImageEnhance


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--config', required=True)
    ap.add_argument('--output', required=True, help='Output basename, without extension')
    args = ap.parse_args()
    config_path = Path(args.config).resolve()
    cfg = json.loads(config_path.read_text(encoding='utf-8-sig'))
    root = config_path.parent
    def local(p):
        p = Path(p).expanduser()
        return p if p.is_absolute() else root / p
    preset=json.loads((Path(__file__).resolve().parents[1]/'assets/default-style.json').read_text(encoding='utf-8-sig'))
    W, H = cfg.get('size', preset['reference_size'])
    k=W/preset['reference_size'][0]
    if not (100 <= W <= 16000 and 100 <= H <= 16000):
        raise ValueError('Choose canvas dimensions between 100 and 16000 pixels')
    font_path = local(cfg['font'])
    bold_path = local(cfg.get('bold_font', cfg['font']))
    def font(size, bold=False):
        return ImageFont.truetype(str(bold_path if bold else font_path), int(size))
    im = Image.new('RGB', (W, H), cfg.get('paper', '#ffffff'))
    draw = ImageDraw.Draw(im)
    svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">', f'<rect width="{W}" height="{H}" fill="{cfg.get("paper", "#ffffff")}"/>']
    family = html.escape(cfg.get('font_family', 'Microsoft YaHei'), quote=True)
    blue = cfg.get('route_color', preset['palette']['route'])
    bg = cfg['background']
    src = Image.open(local(bg['image'])).convert('RGB')
    iw, ih = src.size
    bx, by, bw, bh = bg['box']
    ratio = min(bw / iw, bh / ih)
    rw, rh = round(iw * ratio), round(ih * ratio)
    ox, oy = bx + (bw - rw) / 2, by + (bh - rh) / 2
    scaled = src.resize((rw, rh), Image.Resampling.LANCZOS)
    scaled = ImageEnhance.Color(scaled).enhance(bg.get('saturation', preset['background']['saturation']))
    scaled = ImageEnhance.Brightness(scaled).enhance(bg.get('brightness', preset['background']['brightness']))
    veil = bg.get('veil', preset['background']['veil'])
    if not 0 <= veil <= 1:
        raise ValueError('background.veil must be between 0 and 1')
    scaled = Image.blend(scaled, Image.new('RGB', scaled.size, '#dce5e8'), veil)
    im.paste(scaled, (round(ox), round(oy)))
    buffer = io.BytesIO()
    scaled.save(buffer, format='JPEG', quality=95)
    svg.append(f'<image x="{ox}" y="{oy}" width="{rw}" height="{rh}" href="data:image/jpeg;base64,{base64.b64encode(buffer.getvalue()).decode()}"/>')
    def xy(point, space='world'):
        x, y = map(float, point[:2])
        if space == 'canvas':
            return x, y
        if space == 'image':
            return ox + x * rw / iw, oy + y * rh / ih
        if space != 'world':
            raise ValueError('space must be world, image or canvas')
        if 'axes' in bg:
            a = bg['axes']; origin, u, v = a['origin'], a['u'], a['v']
            det = u[0] * v[1] - u[1] * v[0]
            if abs(det) < 1e-12:
                raise ValueError('Raster axes are singular')
            dx, dy = x-origin[0], y-origin[1]
            s, t = (dx*v[1]-dy*v[0])/det, (u[0]*dy-u[1]*dx)/det
        else:
            x0, y0, x1, y1 = bg['extent']
            if x1 <= x0 or y1 <= y0:
                raise ValueError('extent requires ascending x/y bounds')
            s, t = (x-x0)/(x1-x0), (y-y0)/(y1-y0)
        return ox + s*rw, oy + (1-t)*rh
    def pts_text(points):
        return ' '.join(f'{x:.3f},{y:.3f}' for x,y in points)
    def line(points, color, width):
        width = max(1, round(width))
        draw.line(points, fill=color, width=width, joint='curve')
        r=width/2
        for x,y in points:
            draw.ellipse((x-r,y-r,x+r,y+r),fill=color)
        svg.append(f'<polyline points="{pts_text(points)}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"/>')
    def rect(box, fill, radius=10):
        x,y,x2,y2=box
        draw.rounded_rectangle(box, radius=radius, fill=fill)
        svg.append(f'<rect x="{x}" y="{y}" width="{x2-x}" height="{y2-y}" rx="{radius}" fill="{fill}"/>')
    def text(pos, value, size, color='#123c55', bold=False, center=False):
        x,y=pos
        if center:
            bounds=draw.textbbox((0,0),value,font=font(size,bold))
            x-=(bounds[2]-bounds[0])/2
            y-=(bounds[3]-bounds[1])/2+bounds[1]
        draw.text((x,y),value,font=font(size,bold),fill=color)
        svg.append(f'<text x="{x}" y="{y}" dominant-baseline="text-before-edge" font-family="{family}" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{html.escape(value)}</text>')
    def translucent(kind, geometry, color, opacity=.30, stroke=2):
        if not 0 <= opacity <= 1:
            raise ValueError('opacity must be between 0 and 1')
        layer=Image.new('RGBA',im.size,(0,0,0,0));ld=ImageDraw.Draw(layer)
        rgb=tuple(int(color[i:i+2],16) for i in (1,3,5))
        if kind=='polygon':
            ld.polygon(geometry,fill=rgb+(round(255*opacity),))
            ld.line(geometry+[geometry[0]],fill=rgb+(195,),width=stroke,joint='curve')
            svg.append(f'<polygon points="{pts_text(geometry)}" fill="{color}" fill-opacity="{opacity}" stroke="{color}" stroke-opacity="0.76" stroke-width="{stroke}"/>')
        else:
            x,y,r=geometry
            ld.ellipse((x-r,y-r,x+r,y+r),fill=rgb+(round(255*opacity),),outline=rgb+(195,),width=stroke)
            svg.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{color}" fill-opacity="{opacity}" stroke="{color}" stroke-opacity="0.76" stroke-width="{stroke}"/>')
        im.paste(layer,(0,0),layer)
    # Agent supplies interpreted banks and site locations. This renderer infers none.
    for area in cfg.get('areas',[]):
        translucent('polygon',[xy(a,area.get('space','world')) for a in area['points']],area.get('color','#25c8ad'),area.get('opacity',.35),area.get('stroke',2))
    for site in cfg.get('sites',[]):
        x,y=xy(site['point'],site.get('space','world'))
        translucent('circle',(x,y,site.get('radius_px',round(165*k))),site.get('color','#a568d2'),site.get('opacity',.28),site.get('stroke',4))
    for route in cfg.get('routes',[]):
        points=[xy(p,route.get('space','world')) for p in route['points']]
        if len(points)<2:
            raise ValueError('A route needs at least two points')
        width=route.get('width_px',max(1,round(19*k)));case=route.get('casing_px',max(2,round(32*k)))
        if case <= width:
            raise ValueError('casing_px must exceed width_px')
        line(points,'#ffffff',case);line(points,route.get('color',blue),width)
    # All label boxes fit their actual text, rather than inheriting a fixed width.
    for label in cfg.get('labels',[]):
        rows=label['lines'];sizes=label.get('sizes',[round(68*k)]+[round(56*k)]*(len(rows)-1))
        if len(sizes)!=len(rows) or not rows:
            raise ValueError('labels.lines and labels.sizes must be nonempty and match')
        pad=label.get('padding',round(36*k));gap=label.get('gap',round(18*k))
        tw=max(draw.textlength(t,font=font(s,i==0)) for i,(t,s) in enumerate(zip(rows,sizes)))
        width=math.ceil(tw)+2*pad
        height=2*pad+sum(math.ceil(s*1.30) for s in sizes)+gap*(len(rows)-1)
        x,y=label['box_at']
        if label.get('align')=='right':
            x-=width
        if x<0 or y<0 or x+width>W or y+height>H:
            raise ValueError('Label falls outside canvas: '+rows[0])
        color=label.get('color',blue)
        if 'point' in label:
            a=xy(label['point'],label.get('space','world'))
            ex=max(x+pad,min(a[0],x+width-pad))
            edge=(ex,y if a[1]<y else y+height)
            if x<=a[0]<=x+width and y<=a[1]<=y+height:
                raise ValueError('Label covers its own target: '+rows[0])
            line([a,edge],'#ffffff',6);line([a,edge],color,2)
        rect((x+3,y+4,x+width+3,y+height+4),'#446174')
        rect((x,y,x+width,y+height),'#ffffff')
        rect((x,y,x+5,y+height),color,3)
        yy=y+pad
        for i,(t,size) in enumerate(zip(rows,sizes)):
            text((x+pad,yy),t,size,'#123c55' if i==0 else '#506a7b',i==0)
            yy+=math.ceil(size*1.30)+gap
        if 'point' in label:
            ax,ay=a;r=label.get('marker_radius_px',round(39*k))
            draw.ellipse((ax-r,ay-r,ax+r,ay+r),fill=color,outline='white',width=3)
            svg.append(f'<circle cx="{ax}" cy="{ay}" r="{r}" fill="{color}" stroke="white" stroke-width="3"/>')
            if label.get('tag'):
                text(a,label['tag'],r*1.2,'white',True,True)
    # Headings, manual legends and short notes are plain canvas text.
    for entry in cfg.get('texts',[]):
        text(entry['at'],entry['text'],entry.get('size',30),entry.get('color','#123c55'),entry.get('bold',False))
    output=Path(args.output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
    png=Path(str(output)+'.png');vector=Path(str(output)+'.svg')
    im.save(png,dpi=(cfg.get('dpi',300),cfg.get('dpi',300)))
    svg.append('</svg>');vector.write_text('\n'.join(svg),encoding='utf-8')
    print(json.dumps({'png':str(png),'svg':str(vector),'size':[W,H],'background_pixels':[iw,ih],'map_box':[ox,oy,rw,rh]},ensure_ascii=False))

if __name__=='__main__':
    main()
