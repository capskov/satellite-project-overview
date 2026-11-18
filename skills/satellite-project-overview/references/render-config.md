# 绘图配置与运行

使用有Pillow的Python运行：

```text
python scripts/render_overview.py --config scene.json --output output/overview
```

输出同名PNG和SVG，背景嵌入SVG。脚本不操作CAD、不推断河岸、不上网、不添加比例尺；它不会自动排所有图例、箭头、北针或生成PDF/PPT。

`scene.json`中的相对文件路径相对于该配置文件。字体用系统已有字体绝对路径；需要粗体时分别给出。由当前会话的依赖加载器发现Python，不固定缓存路径，不附带字体。

```json
{
  "size": [2400, 1300],
  "font": "C:/Windows/Fonts/msyh.ttc",
  "bold_font": "C:/Windows/Fonts/msyhbd.ttc",
  "font_family": "Microsoft YaHei",
  "background": {
    "image": "satellite.tif",
    "box": [75, 180, 2250, 870],
    "extent": [1000, 2000, 5000, 3600],
    "saturation": 0.65,
    "brightness": 0.95,
    "veil": 0.10
  },
  "routes": [
    {"points": [[1100, 3300], [2500, 3400], [2700, 2300], [4800, 2500]], "width_px": 10, "casing_px": 17}
  ],
  "sites": [
    {"point": [4800, 2800], "radius_px": 70, "color": "#a568d2", "opacity": 0.28}
  ],
  "labels": [
    {"point": [1100, 3300], "box_at": [110, 500], "lines": ["供水接驳点", "接现状供水管"], "tag": "S", "color": "#008b83"},
    {"point": [4800, 2500], "box_at": [2300, 925], "align": "right", "lines": ["园区交水点", "接园区给水系统"], "tag": "E"}
  ],
  "texts": [
    {"at": [75, 40], "text": "项目给水线路总览", "size": 52, "bold": true},
    {"at": [75, 1120], "text": "概化示意；详细定位以设计图为准。", "size": 26}
  ]
}
```

## 坐标空间

每个route/area/site/label可指定 `space`：

- `world`（默认）：原项目平面坐标。轴对齐影像用 `background.extent=[xmin,ymin,xmax,ymax]`；上方为更大Y。
- `image`：原始影像像素，左上角为(0,0)，向右/下增加。适合手工看图后存下的岸线点。用像素边界而不是像素中心时自行先统一半像素约定。
- `canvas`：最终画布像素，左上角为(0,0)。用于已排版的点，不是工程定位。

`box_at`与`texts.at`永远是画布像素。背景等比例完整放入 `background.box=[x,y,width,height]`，可能产生居中余白；脚本输出实际 `map_box`。不要假设实际图像正好填满box。

影像旋转或斜切时，使用完整幅宽/幅高向量，代替extent：

```json
"axes": {"origin": [1000, 2000], "u": [4000, 200], "v": [-80, 1600]}
```

origin为影像左下角，u/v分别为向右及向上的全幅WCS向量。脚本仅作逆矩阵换算，不负责校正输入坐标系统。

## 半透明面、说明与样式

`areas`成员含`points`（闭合点可不重复首点）、`space`、`color`、`opacity`和可选`stroke`；用于已人工判定的河道或区域轮廓。不是让脚本根据颜色自动识别水体。

`sites.radius_px`、routes的线宽均为视觉像素，不是真实米数。图中用途需要另行用标题/图例说明。

说明框按 `lines` 的实际字宽收紧；可指定同长`sizes`数组、padding、gap。`align=right`时box_at为右上角，其他情况为左上角。缩短文字后框会收紧，引线终点随框重算；整体位置仍由Agent选择并复查。脚本只拒绝框越出画布或盖住自身目标，不自动解决框间、框与线路之间的遮挡。

标题、图例或页注通过texts明确排列。需要专业的图例符号、流向箭头、北箭头或不同排版时，在已确认的数据上扩展小范围绘图即可，不必为了适配全部项目把工具变成自动设计程序。

SVG中文字使用font-family，接收方缺字体时可能变化。PNG是视觉一致的便携版本。需要PDF则使用当前PDF技能导出并渲染核查；需要可编辑PPT则按当前演示文稿技能安排原生线面文字和图片。

## 随仓库附带的匿名示例

`assets/example-background.png` 和 `assets/example-scene.json` 为合成数据；将配置中的 `font`、`bold_font` 设置为本机字体后，可用上述命令生成图像。输出属于示范，不用于工程定位。
