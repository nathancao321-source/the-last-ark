# 太阳系程序化美术的参考来源

核查日期：2026-10-21。以下链接均为实际读取的 NASA Science 官方事实页，参考的是天体可辨认的地貌、颜色和云带特征。**本次没有下载、描摹、采样或分发任何外部纹理图片，也没有新增第三方素材文件。** 游戏里的颜色、轮廓、地形、云层、撞击坑、风暴和星环均由本仓库的二维程序绘制。

| 天体 | 官方主要参考 | 视觉关键词 | 二维实现方案 |
| --- | --- | --- | --- |
| 水星 | [NASA Mercury Facts](https://science.nasa.gov/mercury/facts/) | 岩灰、撞击坑、射纹 | 灰褐噪声地形、多个尺度的凹坑与稀疏射纹；不用月海图案 |
| 金星 | [NASA Venus Facts](https://science.nasa.gov/venus/facts/) | 奶油色、厚云、平滑 | 低对比度的弯曲云纹；不绘制地面；极慢连续漂移 |
| 地球 | [NASA Earth Facts](https://science.nasa.gov/earth/facts/) | 海陆、白云、蓝色大气 | 原创概括大陆轮廓、蓝色海洋、程序云层、内侧大气亮缘；不是精确地理地图 |
| 火星 | [NASA Mars Facts](https://science.nasa.gov/mars/facts/) | 铁锈、暗地貌、极冠 | 多尺度赭色地形、暗色区域和小块极冠 |
| 木星 | [NASA Jupiter Facts](https://science.nasa.gov/jupiter/facts/) | 云带、涡流、大红斑 | 连续弯曲的深浅带、细流纹、椭圆风暴；不照搬特定观测时刻 |
| 土星 | [NASA Saturn Facts](https://science.nasa.gov/saturn/facts/) | 柔金、细环、卡西尼缝 | 柔和带状盘面、分层环带与暗缝、背环→球体→前环 |
| 天王星 | [NASA Uranus Facts](https://science.nasa.gov/uranus/facts/) | 青蓝、平静、淡层次 | 低饱和青蓝底色、极弱云带和受光渐变 |
| 海王星 | [NASA Neptune Facts](https://science.nasa.gov/neptune/facts/) | 深蓝、风带、风暴 | 为游戏辨识度保留较深蓝色，轻微云带及局部风暴；不主张精确校色 |
| 冥王星 | [NASA Pluto Facts](https://science.nasa.gov/dwarf-planets/pluto/facts/) | 灰褐、冰原、浅斑 | 不均匀冰岩底材及概括的浅色冰原；仍是矮行星 |

## 来源与许可边界

实际核查了 [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)。该指引说明 NASA 内容在美国一般不受版权保护，但 NASA 标识、人物、第三方受版权保护内容及商业背书有各自限制；**不能把整个 nasa.gov 的所有图片都视为无条件公有领域**。

本次仅使用上述官方页面的科学事实与文字视觉描述作为研究参考，绘图代码和生成像素是本项目原创。没有将页面配图、NASA 标识、第三方照片或网页截图作为游戏资产，因此也没有把 NASA 或合作机构的图片重新许可为 MIT。项目不声称获得 NASA/JPL/USGS 的认可或背书。

既有本地配乐不属于本次行星美术来源清单，也不纳入远端提交。
