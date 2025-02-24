// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       250218
// @author        aksmf
// @description   image viewer for exhentai
// @include       https://exhentai.org/s/*
// @include       https://e-hentai.org/s/*
// @require       https://code.jquery.com/jquery-3.2.1.min.js
// @require       https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js
// @resource      bt https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_deleteValue
// @grant         GM_listValues
// @grant         GM_getResourceText
// @grant		  GM.getResourceUrl
// ==/UserScript==

// update functions is currently disabled due to tampermonkey's cross origin warning
// if you want use update function, make update_check true

// ============== Viewer global ==============
var update_check = false;
var images = {}; // image datas (url, width, height, path, nl, updated), 0-indexed
var spread = 1;
var is_single_displayed = true;
var curPanel; // current panel number (1-indexed)
var number_of_images; //placeholder
var comicImages;

// ============== Exh global ==============
var API_URL = null;
var GID_TOKEN = null;
var host_regex = /^(.+)\/\/(.+?)\/(.+)/g;
var host = host_regex.exec(document.location)[2];
if (host === 'exhentai.org')
    API_URL = 'https://exhentai.org/api.php';
else if (host === 'e-hentai.org')
    API_URL = 'https://e-hentai.org/api.php';
else
    alert("Host unavailable!\nHOST: "+host);


// ============== Exh specific functions ==============

async function getToken() {
    // GID_TOKEN이 이미 존재하면 즉시 반환
    if (GID_TOKEN) return GID_TOKEN;

    // URL에서 필요한 정보를 추출
    const page_regex = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
    const match = page_regex.exec(document.location);
    const data = {
        method: 'gtoken',
        pagelist: [[match[2], match[1], match[3]]]
    };

    try {
        // simpleRequestAsync로 API 호출
        const response = await simpleRequestAsync(API_URL, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(data));

        // 응답을 JSON으로 파싱 후 토큰 저장
        const tokens = JSON.parse(response.responseText).tokenlist[0];
        GID_TOKEN = { gid: tokens.gid, token: tokens.token };
        return GID_TOKEN;

    } catch (error) {
        console.error("Error fetching token:", error);
        throw error;  // 호출한 곳에서 에러를 처리할 수 있도록 다시 던짐
    }
}


var getGdataAsync = async function (gid, token) {
    var data = {
        'method': 'gdata',
        'gidlist': [[gid, token]]
    };
    const response = await simpleRequestAsync(API_URL, 'POST', {}, JSON.stringify(data));
    return response;
};


var extractImageData = async function (url, idx) {
    const response = await simpleRequestAsync(url);  // 비동기 요청 대기
    const doc = parseHTML(response);

    // 파일 정보에서 이미지 크기 추출
    const fileInfoText = doc.getElementById('i4').firstChild.firstChild.textContent;
    const fileInfoMatch = fileInfoText.match(/ :: (\d+) x (\d+)/);
    if (!fileInfoMatch) throw new Error("File info not found");
    
    return {
        path: doc.getElementById('img').src,
        width: Number(fileInfoMatch[1]),
        height: Number(fileInfoMatch[2])
    }
}

var getReloadInfo = async function (entry_idx, entry_url) {
    var ret = [];
    for (var idx = 0; idx < entry_url.length; idx++) {
        var url = entry_url[idx];
        var response = await simpleRequestAsync(url);
        var doc = parseHTML(response);
        const loadFailAttr = doc.getElementById("loadfail").getAttribute("onclick");
        const nlMatch = loadFailAttr.match(/nl\('(.*)'\)/);
        if (!nlMatch) throw new Error("NL value not found");
        
        var nl =  nlMatch[1];
        url = url.replace(/\?.*/, '') + '?nl=' + nl;
        response = await simpleRequestAsync(url);
        doc = parseHTML(response);
        const imgSrc = doc.getElementById('img').src;
        ret.push(imgSrc);
    }
    return ret;
}


// ============== Viewer setup ==============

//style
var clearStyle = function () {
  for (var i = document.styleSheets.length - 1; i >= 0; i--) {
    document.styleSheets[i].disabled = true;
  }
  var arAllElements = (typeof document.all != 'undefined') ?
  document.all : document.getElementsByTagName('*');
  for (var i = arAllElements.length - 1; i >= 0; i--) {
    var elmOne = arAllElements[i];
    if (elmOne.nodeName.toUpperCase() == 'LINK') {
      // remove <style> elements defined in the page <head>
      elmOne.remove();
    }
  }
};

var addStyle = typeof GM_addStyle !== 'undefined' ? GM_addstyle :
function (css) {
  var parent = document.head || document.documentElement;
  var style = document.createElement('style');
  style.type = 'text/css';
  var textNode = document.createTextNode(css);
  style.appendChild(textNode);
  parent.appendChild(style);
};

var disable = function (elem) {
    elem.parent().addClass('disabled');
    elem.children().removeClass('icon_white');
};

var enable = function (elem) {
    elem.parent().removeClass('disabled');
    elem.children().addClass('icon_white');
};

// GM_getResourceText is deprecated in Greasemonkey4
var addStyleFromResource = async function (res) {
  if (typeof GM_getResourceText !== 'undefined'){
    var bt_css = GM_getResourceText(res);
		addStyle(bt_css);
  } else {
    var fileName = await GM.getResourceUrl(res);
  	var head = document.head;
	  var link = document.createElement("link");
	  link.type = "text/css";
	  link.rel = "stylesheet";
	  link.href = fileName;
	  head.appendChild(link);
  }
}

// Viewer styles
var viewer_style = `
html {
  height: 100%;
}
body {
  background: #171717;
  font-size: 15px;
  font-weight: bold;
  background-color: #171717 !important;
  color: #999;
  height: 100%;
  overflow: hidden;
}
h1 {
  color: #fff;
}
body .modal {
  color: #333;
}
.nav>li>a {
  padding: 15px 10px;
}

#comicImages {
  height: calc(100% - 50px);
  overflow: auto;
  text-align: center;
  white-space: nowrap;
}
#comicImages .centerer {
  display: inline-block;
  vertical-align: middle;
  height: 100%;
}
#imageDragger {
  pointer-events: none;
  cursor: default;
  position: fixed;
  margin-bottom: 25px;
  z-index: 1;
  width: 30%;
  height: calc(100% - 50px - 25px);
  left: 35%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

/* fitStretch */
.fitStretch img {
  display: inline-block;
  vertical-align: middle;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* fitBoth */
.fitBoth img {
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
  max-height: 100%;
}
.spread2 .fitBoth img {
  max-width: 50%;
}

/* fitVertical styles */
.fitVertical img {
  display: inline-block;
  vertical-align: middle;
  max-height: 100%;
}
.spread2 .fitVertical img {
  max-width: 50%;
}

/* fitHorizontal styles */
.fitHorizontal img {
  display: inline-block;
  vertical-align: middle;
  max-width: 100%;
}
.spread2 .fitHorizontal img {
  max-width: 50%;
}

#preload {
  display: none;
}
.img-url {
  display: none;
}
a:hover {
  cursor: pointer;
  text-decoration: none;
}
a:visited,
a:active {
  color: inherit;
}
.disabled > a:hover {
  background-color: transparent;
  background-image: none;
  color: #333333 !important;
  cursor: default;
  text-decoration: none;
}
.disabled > a {
  color: #333333 !important;
}
:-moz-full-screen {
  background: #000 none repeat scroll 0 0;
}
.icon_white {
  color: white;
}
.imageBtn,
.imageBtn:hover {
  position: fixed;
  margin-bottom: 25px;
  z-index: 1;
  width: calc(35% - 25px);
  height: calc(100% - 50px - 25px);
  font-size: 30px;
  color: rgba(255, 255, 255, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}
#leftBtn {
  margin-left: 25px;
  left: 0px;
}
#rightBtn {
  margin-right: 25px;
  right: 0px;
}

/* dropdown styles */
#interfaceNav {
  margin: 0px;
  border: 0px;
}
.dropdown-menu {
  text-align: left;
}
.dropdown-menu span {
  text-align: center;
  display: inline-block;
  min-width: 18px;
}
.inverse-dropdown {
  background-color: #222 !important;
  border-color: #080808 !important;
}
.inverse-dropdown > li > a {
  color: #999999 !important;
}
.inverse-dropdown > li > a:hover {
  color: #fff !important;
  background-color: #000 !important;
}

#autoPager {
  display: inline;
}
#pageTimer {
  margin: 15px 15px 15px 3px;
  border: 0px;
  height: 18px;
  width: 46px;
}
#pageChanger {
  display: inline;
}
.input-medium {
  margin: 15px 15px 15px 3px;
  height: 20px;
  width: 58px;
}
#single-page-select {
  width: 60px;
}
#two-page-select {
  width: 60px;
}
#preloadInput {
  color: black;
  margin: 0px 10px;
  width: 35px;
  height: 17px;
}

@media (min-width: 768px) {
  .navbar .navbar-nav {
    display: inline-block;
    float: none;
    vertical-align: top;
  }
  .navbar .navbar-collapse {
    text-align: center;
  }
}

/* exitfullscreen button */
#fullscreen {
  position: fixed;
  top: 0;
  right: 10px;
  z-index: 1000;
  margin: 10px;
  font-size: 20px;
  color: white;
}
`;


// Image rendering option. needs ID to render swap
var renderType = 0;
var parent = document.head || document.documentElement;
var style = document.createElement('style');
style.type = 'text/css';
var renderStyle = document.createTextNode('');
renderStyle.id = 'renderStyle';
style.appendChild(renderStyle);
parent.appendChild(style);

// imagehight styles when fullscreen
var fullscreen_style = `
div:-webkit-full-screen {background-color: black;}
div:-moz-full-screen {background-color: black;}
div:-ms-fullscreen {background-color: black;}
div:fullscreen {background-color: black;}
.fitVertical:-webkit-full-screen img {max-height: 100% !important;}
.fitVertical:-moz-full-screen img {max-height: 100% !important;}
.fitVertical:-ms-fullscreen img {max-height: 100% !important;}
.fitVertical:fullscreen img {max-height: 100% !important;}
.fitStretch:-webkit-full-screen img {height: 100% !important; width: auto !important;}
.fitStretch:-moz-full-screen img {height: 100% !important; width: auto !important;}
.fitStretch:-ms-fullscreen img {height: 100% !important; width: auto !important;}
.fitStretch:fullscreen img {height: 100% !important; width: auto !important;}
`;



var addNavBar = function () {
    var overlay = `
    <nav id="interfaceNav" class="navbar navbar-inverse navbar-static-top">
      <div class="container-fluid">
        <div class="navbar-header">
          <a class="navbar-brand" id="galleryInfo">Gallery</a>
          <button type="button" id="navbar-button" class="navbar-toggle" data-toggle="collapse" data-target="#collapseNavbar">
            <span class="icon-bar"></span>
            <span class="icon-bar"></span>
            <span class="icon-bar"></span>
          </button>
        </div>
        <div class="collapse navbar-collapse" id="collapseNavbar">
          <ul id="funcs" class="nav navbar-nav">
            <li>
              <a title="Left arrow or j" id="nextPanel">
                <span class="icon_white">&#11164;</span> Next
              </a>
            </li>
            <li>
              <a title="Right arrow or k" id="prevPanel">
                <span class="icon_white">&#11166;</span> Prev
              </a>
            </li>
            <li>
              <a title="t key" id="autoPager">
                <span>▶</span>Auto
              </a>
              <input id="pageTimer" type="text" value="10">
            </li>
            <li>
              <a title="g key" id="pageChanger">
                <span>#</span> Page
              </a>
              <select class="input-medium" id="single-page-select"></select>
              <select class="input-medium" style="display: none;" id="two-page-select"></select>
            </li>
            <li class="dropdown">
              <a class="dropdown-toggle" data-toggle="dropdown" href="#">
                Options<span class="caret"></span>
              </a>
              <ul class="inverse-dropdown dropdown-menu">
                <li>
                  <a title="r" id="reload">
                    <span>&#10227;</span> Reload
                  </a>
                </li>
                <!-- To button's text indicate current state, its text content is previous state -->
                <li>
                  <a title="b" class="fitBtn" id="fitStretch">
                    <span>□</span> Fit Stretch
                  </a>
                </li>
                <li>
                  <a title="b" class="fitBtn" id="fitBoth">
                    <span>┃</span> Fit Vertical
                  </a>
                </li>
                <li>
                  <a title="v" class="fitBtn" id="fitVertical">
                    <span>━</span> Fit Horizontal
                  </a>
                </li>
                <li>
                  <a title="h" class="fitBtn" id="fitHorizontal">
                    <span>╋</span> Fit Both
                  </a>
                </li>
                <li>
                  <a title="f" id="fullSpread">
                    <span>🕮</span> Full Spread
                  </a>
                </li>
                <li>
                  <a title="s" id="singlePage">
                    <span>🗍</span> Single Page
                  </a>
                </li>
                <li>
                  <a title="rendering" id="renderingChanger">
                    <span>🖽</span> Rendering
                  </a>
                </li>
                <li>
                  <a title="p" id="preloader">
                    Preload<input id="preloadInput" type="text" value="50">
                  </a>
                </li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
    </nav>
    `;
    document.body.innerHTML += overlay;
};

var addImgFrame = function () {
    imgFrame = `
    <div id="comicImages" class="fitVertical" tabindex="1">
        <a id="fullscreen" title="Enter or Space">⛶</a>
        <a id="leftBtn" class="imageBtn"></a>
        <a id="rightBtn" class="imageBtn"></a>
        <div class="centerer"></div>
    </div>
    <div id="preload"></div>
    `;
    document.body.innerHTML += imgFrame;
};

// prevent dropdown from close
$('.dropdown-menu').on('click', function(e) {
  e.stopPropagation();
});

var renderChange = function () {
    const renderOptions = [
        {
            style: 'img {image-rendering: optimizeQuality; image-rendering: -webkit-optimize-contrast;}',
            text: '<span>🖽</span> Render: optimized'
        },
        {
            style: 'img {image-rendering: auto;}',
            text: '<span>🖽</span> Render: auto'
        },
        {
            style: 'img {image-rendering: -moz-crisp-edges; image-rendering: pixelated;}',
            text: '<span>🖽</span> Render: pixelated'
        }
    ];

    renderType = (renderType + 1) % renderOptions.length;
    renderStyle.textContent = renderOptions[renderType].style;
    document.getElementById('renderingChanger').innerHTML = renderOptions[renderType].text;
};


// ============== request/parsing functions
// code from koreapyj/dcinside_lite
Array.prototype.contains = function (needle) {
  for (var i = 0; i < this.length; i++) if (this[i] === needle) return true;
  return false;
};
var xmlhttpRequest = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest :
function (details) {
  var bfloc = null;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.ontimeout = function () {
    details.ontimeout();
  };
  xmlhttp.onreadystatechange = function () {
    var responseState = {
      responseXML: (xmlhttp.readyState === 4 ? xmlhttp.responseXML : ''),
      responseText: (xmlhttp.readyState === 4 ? xmlhttp.responseText : ''),
      readyState: xmlhttp.readyState,
      responseHeaders: (xmlhttp.readyState === 4 ? xmlhttp.getAllResponseHeaders()  : ''),
      status: (xmlhttp.readyState === 4 ? xmlhttp.status : 0),
      statusText: (xmlhttp.readyState === 4 ? xmlhttp.statusText : '')
    };
    if (details.onreadystatechange) {
      details.onreadystatechange(responseState);
    }
    if (xmlhttp.readyState === 4) {
      if (details.onload && xmlhttp.status >= 200 && xmlhttp.status < 300) {
        details.onload(responseState);
      }
      if (details.onerror && (xmlhttp.status < 200 || xmlhttp.status >= 300)) {
        details.onerror(responseState);
      }
    }
  };
  try {
    xmlhttp.open(details.method, details.url);
  } catch (e) {
    if (details.onerror) {
      details.onerror({
        responseXML: '',
        responseText: '',
        readyState: 4,
        responseHeaders: '',
        status: 403,
        statusText: 'Forbidden'
      });
    }
    return;
  }
  if (details.headers) {
    for (var prop in details.headers) {
      if (details.headers.hasOwnProperty(prop)) {
        if (['origin',
        'referer'].indexOf(prop.toLowerCase()) == - 1)
        xmlhttp.setRequestHeader(prop, details.headers[prop]);
         else {
          bfloc = location.toString();
          history.pushState(bfloc, '로드 중...', details.headers[prop]);
        }
      }
    }
  }
  try
  {
    xmlhttp.send((typeof (details.data) !== 'undefined') ? details.data : null);
  }
  catch (e)
  {
    if (details.onerror) {
      details.onerror({
        responseXML: '',
        responseText: '',
        readyState: 4,
        responseHeaders: '',
        status: 403,
        statusText: 'Forbidden'
      });
    }
    return;
  }
  if (bfloc !== null)
  history.pushState(bfloc, bfloc, bfloc);
};

var simpleRequestAsync = function (url, method = 'GET', headers = {}, data = null) {
    return new Promise((resolve, reject) => {
        var details = {
            method,
            url,
            timeout: 10000,
            ontimeout: (e) => reject(new Error("Request timed out")),
            onload: (response) => resolve(response),
            onerror: (error) => reject(new Error(error.statusText || "Request failed"))
        };

        // Add headers if any
        if (headers) {
        details.headers = headers;
        if (headers['content-type'] && headers['content-type'].match(/multipart\/form-data/i)) {
            details.binary = true;
        }
        }

        // Set request data if provided
        if (data) details.data = data;

        xmlhttpRequest(details);
    });
};

var parseHTML = function (response) {
    var doc = document.implementation.createHTMLDocument('temp');
    doc.documentElement.innerHTML = response.responseText;
    return doc;
};

// ==========  Update functions ==========
var openInNewTab = function (url) {
    var win = window.open(url, '_blank');
    win.focus();
  };
  
var checkUpdate = function () {
    var github_api = "https://api.github.com";
    var repo_path = "/repos/skygarlics/exhviewer";
    // version_now
    var p_version = GM_info.script.version;
    simpleRequestAsync(github_api + repo_path + '/releases/latest')
    .then((response) => {
        resp_json = JSON.parse(response.responseText);
        var n_version = parseInt(resp_json["tag_name"]);
        var url = resp_json["assets"][0]["browser_download_url"];
        if ((p_version < n_version) && confirm("새 버전 : " + n_version + "\n업데이트 하시겠습니까?")) {
            alert("설치 후 새로고침하면 새 버전이 적용됩니다.");
            openInNewTab(url);
        }
    }) ;
};
  

////////////////////////////////////////////////////////////////

var pageChanged = function () {
  var n_panel = Number(curPanel);
  drawPanel();

  if (n_panel == 1) {
    disable($('#prevPanel'));
  }
  if (n_panel >= number_of_images) {
    disable($('#nextPanel'));
  }
};


var selectorChanged = function (selector_num) {
  if (selector_num === 1) {
    selector = $('#single-page-select');
  } else if (selector_num === 2) {
    selector = $('#two-page-select');
  } else {
    console.error("Invalid selector value:", selector_num);
  }

  var selectedValue = selector.val();
  // `prevPanel`과 `nextPanel`을 조건에 따라 enable/disable
  selectedValue == 1 ? disable($('#prevPanel')) : enable($('#prevPanel'));
  selectedValue == number_of_images ? disable($('#nextPanel')) : enable($('#nextPanel'));

  curPanel = selectedValue;
  pageChanged();
  selector.trigger('blur');
};

const dragState = {
    isDragging: false,
    prevX: 0,
    prevY: 0
};

const imgDrag = (e) => {
    if (!dragState.isDragging) return;

    if (e.pageX > 0) {
    comicImages.scrollLeft += dragState.prevX - e.pageX;
    dragState.prevX = e.pageX;
    }
    if (e.pageY > 0) {
    comicImages.scrollTop += dragState.prevY - e.pageY;
    dragState.prevY = e.pageY;
    }
};

const imgDragStart = (e) => {
    dragState.prevX = e.pageX;
    dragState.prevY = e.pageY;
    dragState.isDragging = true;
};

const imgDragEnd = () => {
    dragState.isDragging = false;
};

const doWheel = (e) => {
    const prevScrollTop = comicImages.scrollTop;
    comicImages.scrollTop += e.deltaY;

    requestAnimationFrame(() => {
    if (comicImages.scrollTop === prevScrollTop) {
        e.deltaY > 0 ? nextPanel() : prevPanel();
    }
    });
};


var toggleTimer = function () {
  var intervalSeconds = parseFloat(document.getElementById('pageTimer').value);
  if (intervalSeconds < 1 || isNaN(intervalSeconds)) {
      return;
  }

  toggleTimer.flag = !toggleTimer.flag;
  var pagerButton = document.getElementById('autoPager').getElementsByTagName('span')[0];

  if (toggleTimer.flag) {
      pagerButton.classList.add('icon_white');
      toggleTimer.interval = setInterval(nextPanel, intervalSeconds * 1000);
  } else {
      pagerButton.classList.remove('icon_white');
      clearInterval(toggleTimer.interval);
  }
};
toggleTimer.flag = false;


var doHotkey = function (e) {
    switch (e.key.toLowerCase()) {
    case 'j':
    case 'arrowleft':
        nextPanel();
        break;
    case 'k':
    case 'arrowright':
        prevPanel();
        break;
    case 'b':
        fitBoth();
        break;
    case 'v':
        fitVertical();
        break;
    case 'h':
        fitHorizontal();
        break;
    case 'f':
        setSpread(2);
        break;
    case 's':
        setSpread(1);
        break;
    case 'enter':
    case ' ':
        fullscreen();
        break;
    case 't':
        toggleTimer();
        break;
    case 'r':
        reloadImg();
        break;
    case 'p':
        preloader();
        break;
    }
};


var createDropdown = function () {
    for (var i = 1; i <= number_of_images; i++) {
    var option = $('<option>', {
        html: '' + i,
        value: i
    });
    $('#single-page-select').append(option);
    }
    for (var i = 1; i <= number_of_images; i++) {
    var option = $('<option>', {
        html: '' + i,
        value: i
    });
    $('#two-page-select').append(option);
    }
};

var updateDropdown = function (num) {
    var selectElement = num === 1 ? "#single-page-select" : "#two-page-select";
    if ($(selectElement + " option:selected").val() === curPanel) {
        return;
    }

    $(selectElement + " option").prop("selected", false);
    $(selectElement + ` option[value="${curPanel}"]`).prop("selected", true);
};

var updateImgsAndCallAsync = async function(start, end) {
    if (end < start) {
      console.error("Error in updateImgsAndCall: start is greater than end");
      return;
    }

    const update_entry = [];
    for (let idx = Math.max(start, 1); idx < Math.min(end, number_of_images + 1); idx++) {
        update_entry.push(idx - 1);
    }

    const promise_entry = update_entry.map(async (idx) => {
        const img = images[idx];
        if (img && img.updated) return;  // 이미 업데이트된 경우 skip
        await updateImgData(img, idx, extractImageData);  // async 함수 호출
    });

    await Promise.all(promise_entry);
};

var updateImgData = async function (img, idx, callback) {
    try {
        // imgData structure
        // {url: string, width: number, height: number, path: string, updated: boolean}
        var imgData = await callback(img.url, idx)

        // 이미지 경로 및 크기 정보 업데이트
        img.path = imgData.path;
        img.width = imgData.width;
        img.height = imgData.height;
        img.updated = true;
    } catch (error) {
        console.error("Error updating image:", error);
        throw error;  // 오류가 발생한 경우 상위로 throw하여 처리
    }
};

var reloadImg = async function () {
    //console.log('reloadImg called');
    var n_curPanel = Number(curPanel);

    // images[n_curPanel] = next page
    // if current page is last, entry current page only

    var entry_idx;
    var entry_url;

    if (n_curPanel == number_of_images) {
        entry_idx = [n_curPanel];
        entry_url = [images[n_curPanel].url];
    } else {
        entry_idx = [n_curPanel-1, n_curPanel];
        entry_url = [images[n_curPanel-1].url, images[n_curPanel].url];
    }

    var reloadinfo = await getReloadInfo(entry_idx, entry_url);
    for (var idx = 0; idx < reloadinfo.length; idx++) {
        images[entry_idx[idx]].path = reloadinfo[idx];
    }
    drawPanel();
};

var preloader = function() {
    var len = document.getElementById('preloadInput').value;
    preloadImage(parseInt(len));
}

var preloadImage = async function(length) {
    const preloadContainer = $('#preload');
    const currentPanel = parseInt(curPanel);
    n_curPanel = currentPanel;

    // 이미지 업데이트 호출 및 완료 후 처리
    await updateImgsAndCallAsync(n_curPanel - 2, n_curPanel + length + 1);

    // 현재 preloadContainer 내의 img 요소 선택
    let imgElements = preloadContainer.find('img');

    // 필요한 이미지를 미리 로드하고 src만 업데이트
    for (let idx = 0; idx < length; idx++) {
        const panelIndex = currentPanel + idx;

        // 이미지가 존재하는 경우에만 로드
        if (panelIndex < number_of_images) {
            const imagePath = images[panelIndex].path;

            if (idx < imgElements.length) {
                // 이미 img 요소가 있으면 src만 변경
                $(imgElements[idx]).attr('src', imagePath);
            } else {
                // 부족한 경우 새 img 요소를 추가
                const newImage = $('<img />', { src: imagePath });
                preloadContainer.append(newImage);
                imgElements = preloadContainer.find('img'); // imgElements 업데이트
            }
        }
    }
    // 불필요한 추가 노드가 있으면 제거
    if (imgElements.length > length) {
        imgElements.slice(length).remove();
    }
};

function updateImageWithFadeIn(imgElement, newSrc) {
    // 임시 이미지 객체를 생성하여 새 이미지를 로드
    const tempImg = new Image();

    // 새 이미지의 경로 설정 (로딩이 바로 시작됨)
    tempImg.src = newSrc;

    // 이미지가 캐시에 있는 경우: 즉시 로드 완료 이벤트가 발생
    tempImg.onload = function () {
        // 즉시 로드된 경우, src를 변경하고 바로 표시
        imgElement.attr('src', newSrc).css('opacity', '1');
    };

    // 이미지가 캐시에 없는 경우: 로드가 완료될 때까지 투명하게 유지
    tempImg.onerror = function () {
        console.error("Image failed to load:", newSrc);
        imgElement.css('opacity', '0'); // 에러일 경우 계속 숨김
    };

    // 캐시되지 않은 이미지는 로드 완료 후 표시
    if (!tempImg.complete) {
        // 이미지가 캐시되지 않은 경우 로드될 때까지 투명하게 설정
        imgElement.css('opacity', '0');

        // 로드 완료 시 이미지의 src를 교체하고 표시
        tempImg.onload = function () {
            imgElement.attr('src', newSrc).css('opacity', '1');
        };
    }
}


var drawPanel_ = function () {
    const comicImagesContainer = $('#comicImages');
    const currentPanel = Number(curPanel);
    const totalImages = Number(number_of_images);
    const singleSpread = spread === 1;

    $('body').attr('class', singleSpread ? 'spread1' : 'spread2');

    // 기존 img 요소를 가져오거나 없는 경우 새로 추가
    let imgElements = comicImagesContainer.find('img');
    const requiredImageCount = singleSpread ? 1 : 2;

    while (imgElements.length < requiredImageCount) {
        $('<img />').appendTo(comicImagesContainer);
        imgElements = comicImagesContainer.find('img'); // 추가 후 업데이트
    }

    if (!singleSpread && currentPanel > 1 && currentPanel < totalImages) {
        const currentImage = images[currentPanel];
        const previousImage = images[currentPanel - 1];

        // 이미지의 가로 세로 비율에 따라 두 이미지를 표시할지 결정
        // TODO : nextPanel, prevPanel에서도 계산되는거 제거하기?
        if (currentImage.width <= currentImage.height && previousImage.width <= previousImage.height) {
            updateImageWithFadeIn($(imgElements[1]), previousImage.path);
            updateImageWithFadeIn($(imgElements[0]), currentImage.path);
            is_single_displayed = false;
            preloadImage(3);
        } else {
            updateImageWithFadeIn($(imgElements[0]), previousImage.path);
            $(imgElements[1]).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
            is_single_displayed = true;
            preloadImage(2);
        }
    } else if (currentPanel <= totalImages) {
        updateImageWithFadeIn($(imgElements[0]), images[currentPanel - 1].path);
        is_single_displayed = true;
        $(imgElements[1]).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
        preloadImage(2);
    }

    if (!drawPanel_.listenersAdded) {
        $('#leftBtn').on('click', prevPanel);
        $('#rightBtn').on('click', nextPanel);
        drawPanel_.listenersAdded = true;
    }

    comicImagesContainer.scrollTop(0);
    $('body').scrollTop(0);
};

var drawPanel = function () {
    n_curPanel = parseInt(curPanel);
    updateImgsAndCallAsync(n_curPanel, n_curPanel+2)
    .then(drawPanel_);
};

var goPanel = function () {
    const target = parseInt(prompt('target page'), 10);

    // target이 NaN이 아니고, 지정된 범위 내에 있을 때만 패널을 변경
    if (Number.isInteger(target) && target >= 0 && target <= number_of_images) {
        panelChange(target);
    }
};

var panelChange = function (target) {
    if (spread == 1) {
        $('#single-page-select').prop('selectedIndex', target - 1);
        selectorChanged(1);
    } else {
        $('#two-page-select').prop('selectedIndex', target - 1);
        selectorChanged(2);
    }
};

var prevPanel = function () {
    const currentPanel = parseInt(curPanel, 10);

    if (currentPanel <= 1) return;

    if (is_single_displayed) {
      panelChange(currentPanel - 1);
    } else {
      const prevImage = images[currentPanel - 2];
      const newPanel = (currentPanel > 2 && prevImage.width <= prevImage.height)
                        ? currentPanel - 2
                        : currentPanel - 1;
      panelChange(newPanel);
    }

    $('body').scrollTop(0);
};

var nextPanel = function () {
    const currentPanel = parseInt(curPanel, 10);

    if (currentPanel >= number_of_images) return;

    if (is_single_displayed) {
      panelChange(currentPanel + 1);
    } else {
      const nextImage = images[currentPanel]; // images is 0-based, and currentPanel is 1-based
      const newPanel = (currentPanel + 1 < number_of_images && nextImage.width <= nextImage.height)
                       ? currentPanel + 2
                       : currentPanel + 1;
      panelChange(newPanel);
    }

    $('body').scrollTop(0);
};


var setSpread = function (num) {
    if (spread == num) return

    $('body').removeClass('spread' + spread);
    spread = num;
    $('body').addClass('spread' + spread);

    const isSinglePage = spread === 1;

    $('#singlePage').toggle(isSinglePage);
    $('#single-page-select').toggle(isSinglePage);

    $('#fullSpread').toggle(!isSinglePage);
    $('#two-page-select').toggle(!isSinglePage);

    drawPanel();
}


var resetFit = function () {
    $('#comicImages').removeClass();
    $('.fitBtn').parent().hide();
};

const fitOptions = {
    stretch: { className: 'fitStretch', nextButton: '#fitBoth' },
    both: { className: 'fitBoth', nextButton: '#fitHorizontal' },
    horizontal: { className: 'fitHorizontal', nextButton: '#fitVertical' },
    vertical: { className: 'fitVertical', nextButton: '#fitStretch' }
};

const applyFit = function (fitType) {
    resetFit();
    $('#comicImages').addClass(fitOptions[fitType].className);
    $(fitOptions[fitType].nextButton).parent().show();
    $('body').scrollTop(0);
};

// 사용 예시
var fitStretch = () => applyFit('stretch');
var fitBoth = () => applyFit('both');
var fitHorizontal = () => applyFit('horizontal');
var fitVertical = () => applyFit('vertical');


// Function to handle fullscreen change
var handleFullscreenChange = function () {
    if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
        // Fullscreen mode is active
        //fullscreenButton.style.display = 'block';
    } else {
        // Fullscreen mode is inactive
        //fullscreenButton.style.display = 'none';
    }
};

// Add event listener for fullscreen change
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);


var fullscreen = function () {
    var elem = comicImages;
    if (!document.fullscreenElement) {
        elem.requestFullscreen?.() || elem.msRequestFullscreen?.() || elem.mozRequestFullScreen?.() || elem.webkitRequestFullscreen?.();
    } else {
        document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.() || document.msExitFullscreen?.();
    }
};


// ============== Initialization ==============

var init = async function () {
    if (update_check) {
        checkUpdate();
    }

    // clear page
    // todo : don't clear page already loaded
    // overlap interface on top of page
    document.body.innerHTML = '';
    clearStyle();
    addStyle('div#i1 {display:none;} p.ip {display:none;}');
    
    // set interface
    addNavBar();
    addImgFrame();
    var head = document.head;
    var link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css";
    head.appendChild(link);

    addStyle(viewer_style);
    addStyle(fullscreen_style);
    document.body.setAttribute('class', 'spread1');
    comicImages = document.getElementById("comicImages");

    // set cur panel
    var url = document.location.href;

    // exhbound -curpanel
    curPanel = Number(url.substring(url.lastIndexOf('-') + 1));

    getToken()
    .then(token => getGdataAsync(token.gid, token.token))
    .then((response) => {
        // make image list
        var gmetadata = JSON.parse(response.responseText).gmetadata[0];
        number_of_images = Number(gmetadata.filecount);
        createDropdown();
        var gallery_url = 'https://' + host + '/g/' + gmetadata.gid + '/' + gmetadata.token + '/?p=';

        var pushImgs = function (doc) {
            var imgs = doc.querySelectorAll("#gdt > a");
            for (var idx = 0; idx < imgs.length; idx++) {
                var regex_temp = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
                var img = imgs[idx];
                var url_temp = img.href;
                var match_temp = regex_temp.exec(url_temp);
                images[match_temp[3] - 1] = {
                    page: match_temp[3],
                    url: url_temp,  // url is page that contains image, not path of image
                    token: match_temp[1]
                };
            }
        };

        var gallery_page_len;
        var current_gallery_page;
        var gallery_page_len;

        simpleRequestAsync(gallery_url + 0)
        .then(parseHTML)
        .then((doc) => {
            // pages td count in table.ptt
            var table = doc.querySelector('table.ptt');
            var cnt = doc.querySelectorAll("#gdt > a").length;
            if (table.querySelectorAll('td').length > 3) { // if there are more than 3 buttons, there are more than 1 page
                // determine image per page
                gallery_page_len = Math.ceil(number_of_images / cnt);
            } else {
                gallery_page_len = 1;
            }

            current_gallery_page = Number(table.querySelector('.ptds').textContent);

            $('#single-page-select').prop('selectedIndex', curPanel - 1);
            $('#two-page-select').prop('selectedIndex', curPanel - 1);

            // push requestes page1 images
            pushImgs(doc);
        })
        // push current page first
        .then(() => {
            if (current_gallery_page !== 1) {
                return simpleRequestAsync(gallery_url + (current_gallery_page - 1))
                    .then(parseHTML)
                    .then(pushImgs);
            }
        })
        .then(pageChanged)
        // load rest of galleries
        .then(()=>{
            for (var i = 1; i < gallery_page_len+1; i++) {
                if (i+1 !== current_gallery_page) {
                    simpleRequestAsync(gallery_url + i)
                    .then(parseHTML)
                    .then(pushImgs);
                }
            }
        });
    })
    .catch(error => console.error("Error initializing viewer:", error));

    // remove original events.
    document.onkeydown = null;
    document.onkeyup = null;

    getToken()
    .then(token => {document.getElementById('galleryInfo').href = 'https://' + host + '/g/' + token.gid + '/' + token.token;});
    document.addEventListener('keydown', doHotkey);
    document.addEventListener('wheel', doWheel);
    document.getElementById('prevPanel').addEventListener('click', prevPanel);
    document.getElementById('nextPanel').addEventListener('click', nextPanel);
    document.getElementById('fitStretch').addEventListener('click', fitStretch);
    document.getElementById('fitBoth').addEventListener('click', fitBoth);
    document.getElementById('fitVertical').addEventListener('click', fitVertical);
    document.getElementById('fitHorizontal').addEventListener('click', fitHorizontal);
    document.getElementById('fullscreen').addEventListener('click', fullscreen);
    document.getElementById('fullSpread').addEventListener('click', ()=>setSpread(1));
    document.getElementById('singlePage').addEventListener('click', ()=>setSpread(2));
    document.getElementById('renderingChanger').addEventListener('click', renderChange);
    document.getElementById('reload').addEventListener('click', reloadImg);
    document.getElementById('preloader').addEventListener('click', preloader);
    document.getElementById('autoPager').addEventListener('click', toggleTimer);
    document.getElementById('pageChanger').addEventListener('click', goPanel);
    document.getElementById('single-page-select').addEventListener('change', ()=>selectorChanged(1));
    document.getElementById('two-page-select').addEventListener('change', ()=>selectorChanged(2));
    document.getElementById('comicImages').addEventListener('dragstart', imgDragStart);
    document.getElementById('comicImages').addEventListener('drag', imgDrag);
    document.getElementById('comicImages').addEventListener('dragend', imgDragEnd);
    $('.navbar ul li').show();
    $('#fullSpread').hide();
    var docElm = document.documentElement;
    if (!docElm.requestFullscreen && !docElm.mozRequestFullScreen && !docElm.webkitRequestFullScreen && !docElm.msRequestFullscreen) {
        $('#fullscreen').parent().hide();
    }
    renderChange();
    fitVertical();
};

init();
