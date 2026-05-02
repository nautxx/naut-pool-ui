# PNG to SVG

#### Convert image to b64 string
```bash
base64 -i IMG_5463_steam_x2_cropped_circle.png > logo.b64.txt
```
<br></br>
#### Copy all the text into .svg
```bash
<svg xmlns="http://www.w3.org/2000/svg"
     width="1024"
     height="1024"
     viewBox="0 0 1024 1024">

  <defs>
    <clipPath id="avatarClip">
      <circle cx="512" cy="512" r="400" />
    </clipPath>
  </defs>
  <image
    x="112"
    y="112"
    width="800"
    height="800"
    clip-path="url(#avatarClip)"
     href="data:image/png;base64,PASTE_ALL_THE_BASE64_TEXT_HERE" />
</svg>