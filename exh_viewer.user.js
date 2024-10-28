// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       230604
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
// @grant					GM.getResourceUrl
// ==/UserScript==

// update functions is currently disabled due to tampermonkey's cross origin warning
// if you want use update function, make update_check true
var update_check = false;
var API_URL = null;

var images = {};
var display = 1;
var curPanel;
var number_of_images; //placeholder
var comicImages;
var single_displayed = true;

var GID_TOKEN = null;

var host_regex = /^(.+)\/\/(.+?)\/(.+)/g;
var host = host_regex.exec(document.location)[2];
if (host === 'exhentai.org')
    API_URL = 'https://exhentai.org/api.php';
else if (host === 'e-hentai.org')
    API_URL = 'https://e-hentai.org/api.php';
else
    alert("Host unavailable!\nHOST: "+host);

// remove original events.
document.onkeydown = null;
document.onkeyup = null;

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
var viewer_style =
  "html, body {height: 100%;}"+
  "body {background: #171717; font-size: 15px; font-weight:bold; background-color: #171717 !important; color: #999; height: 100%; overflow: hidden;}"+
  "h1 {color: #fff;}"+
  "body .modal {color: #333;}"+
  ".nav>li>a {padding: 15px 10px}"+

  "#comicImages {height: calc(100% - 50px); overflow: auto; text-align: center; white-space:nowrap;}"+
  "#comicImages .centerer {display: inline-block; vertical-align: middle; height: 100%;}"+
  "#imageDragger {pointer-events: none; cursor: default; position: fixed; margin-bottom: 25px; z-index: 1; width: 30%; height: calc(100% - 50px - 25px); left: 35%; display: flex; align-items: center; justify-content: center; text-decoration:none;}"+

  // fitStretch
  ".fitStretch img {display: inline-block; vertical-align: middle; width: 100%; height: 100%; object-fit: contain;}"+
  // fitBoth
  ".fitBoth img {display: inline-block; vertical-align: middle; max-width: 100%; max-height:100%}"+
  //".spread1 .fitVeritcal img {max-width: 100%;}"+
  ".spread2 .fitBoth img {max-width: 50%;}"+

  // fitVertical styles
  ".fitVertical img {display: inline-block; vertical-align: middle; max-height:100%}"+
  //".spread1 .fitVeritcal img {max-width: 100%;}"+
  ".spread2 .fitVertical img {max-width: 50%;}"+

  // fitHorizontal styles
  ".fitHorizontal img {display: inline-block; vertical-align: middle; max-width:100%}"+
  //".spread1 .fitHorizontal img {max-width: 100%;}"+
  ".spread2 .fitHorizontal img {max-width:50%;}"+

  "#preload {display: none;}.img-url {display: none;}"+
  "a:hover {cursor: pointer; text-decoration: none;}"+
  "a:visited, a:active {color: inherit;}"+
  ".disabled > a:hover { background-color: transpsrent; background-image: none; color: #333333 !important; cursor: default; text-decoration: none;}"+
  ".disabled > a {color: #333333 !important;}:-moz-full-screen {background: #000 none repeat scroll 0 0;}"+
  ".icon_white {color: white;}"+
  ".imageBtn, .imageBtn:hover {position: fixed; margin-bottom: 25px; z-index: 1; width: calc(35% - 25px); height: calc(100% - 50px - 25px); font-size: 30px; color: rgba(255, 255, 255, 0.3); display: flex; align-items: center; justify-content: center; text-decoration:none;}"+
  "#leftBtn {margin-left: 25px; left: 0px;}"+
  "#rightBtn {margin-right: 25px; right: 0px;}"+

  // dropdown styles
  "#interfaceNav {margin: 0px; border: 0px;}"+
  ".dropdown-menu {text-align: left;}"+
  ".dropdown-menu span {text-align: center; display: inline-block; min-width: 18px}"+
  ".inverse-dropdown {background-color: #222 !important; border-color: #080808 !important;}"+
  ".inverse-dropdown > li > a {color: #999999 !important}"+
  ".inverse-dropdown > li > a:hover {color: #fff !important; background-color: #000 !important;}"+

  "#autoPager {display: inline}"+
  "#pageTimer {margin: 15px 15px 15px 3px; border: 0px; height: 18px; width: 46px;}"+
  "#pageChanger {display: inline}"+
  ".input-medium {margin: 15px 15px 15px 3px; height: 20px; width: 58px;}"+
  "#single-page-select {width: 60px}"+
  "#two-page-select {width: 60px}"+
  "#preloadInput {color: black; margin: 0px 10px; width: 35px; height: 17px}"+

  "@media (min-width: 768px) {"+
    ".navbar .navbar-nav {display: inline-block; float: none; vertical-align: top;}"+
    ".navbar .navbar-collapse {text-align: center;}"+
  "}";

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
var fullscreen_style = "div:-webkit-full-screen {background-color: black;}"+
  "div:-moz-full-screen {background-color: black;}"+
  "div:-ms-fullscreen {background-color: black;}"+
  "div:fullscreen {background-color: black;}"+
  ".fitVertical:-webkit-full-screen img {max-height: 100% !important;}"+
  ".fitVertical:-moz-full-screen img {max-height: 100% !important;}"+
  ".fitVertical:-ms-fullscreen img {max-height: 100% !important;}"+
  ".fitVertical:fullscreen img {max-height: 100% !important;}"+
  ".fitStretch:-webkit-full-screen img {height: 100% !important; width: auto !important;}"+
  ".fitStretch:-moz-full-screen img {height: 100% !important; width: auto !important;}"+
  ".fitStretch:-ms-fullscreen img {height: 100% !important; width: auto !important;}"+
  ".fitStretch:fullscreen img {height: 100% !important; width: auto !important;}";


// interface
var cElement = function (tag, insert, property, func) {
  var _DIRECT = [
    'className',
    'innerHTML',
    'textContent'
  ];
  var element;
  if (!tag)
  element = document.createTextNode(property);
   else
  element = document.createElement(tag);
  if (insert) {
    var parent;
    var before = null;
    if (insert.constructor === Array) {
      var target = insert[1];
      if (typeof target === 'number') {
        parent = insert[0];
        before = parent.childNodes[target];
      } else {
        before = insert[0];
        parent = before.parentNode;
        if (target === 'next') {
          before = before.nextSibling;
        }
        if (target === 'prev') {
          before = before.previousSibling;
        }
      }
    } else {
      parent = insert;
    }
    parent.insertBefore(element, before);
  }
  if (!tag)
    return element;
  if (property) {
    if (typeof property === 'object') {
      for (var i in property) {
        if (property.hasOwnProperty(i)) {
          if (_DIRECT.contains(i))
          element[i] = property[i];
           else
          element.setAttribute(i, property[i]);
        }
      }
    } else {
      element.textContent = property;
    }
  }
  if (func) {
    element.addEventListener('click', func, false);
  }
  return element;
};

var addNavBar = function () {
  var html =
  '<nav id="interfaceNav"class="navbar navbar-inverse navbar-static-top">'+
    '<div class="container-fluid">'+
      '<div class="navbar-header">'+
        '<a class="navbar-brand" id="galleryInfo">Gallery</a>' +
        '<button type="button" id="navbar-button" class="navbar-toggle" data-toggle="collapse" data-target="#collapseNavbar"><span class="icon-bar"></span><span class="icon-bar"></span><span class="icon-bar"></span> </button>'+
      '</div>'+
      '<div class="collapse navbar-collapse" id="collapseNavbar">' +
        '<ul id="funcs" class="nav navbar-nav">' +
          '<li><a title="Left arrow or j" id="nextPanel"><span class="icon_white">&#11164;</span> Next</a></li>'+
          '<li><a title="Right arrow or k" id="prevPanel"><span class="icon_white">&#11166;</span> Prev</a></li>'+
          '<li><a title="Enter or Space" id="fullscreen"><span>&#9974;</span> Fullscreen</a></li>'+
          '<li><a title="t key" id="autoPager"><span>▶</span>Slideshow</a><input id="pageTimer" type="text" value="10"></li>'+
          '<li><a title="g key" id="pageChanger"<span>#</span>  Page</a>'+
            '<select class="input-medium" id="single-page-select"></select>'+
            '<select class="input-medium" id="two-page-select"></select>'+
          '</li>'+
          '<li class="dropdown">'+
            '<a class="dropdown-toggle" data-toggle="dropdown" href="#">Options<span class="caret"></span></a>'+
            '<ul class="inverse-dropdown dropdown-menu">'+
              '<li><a title="r" id="reload"><span>&#10227;</span> Reload</a></li>'+
              // To button's text indicate current state, its text content is previous state
              '<li><a title="b" class="fitBtn" id="fitStretch"><span>□</span> Fit Stretch</a></li>' +
              '<li><a title="b" class="fitBtn" id="fitBoth"><span>┃</span> Fit Vertical</a></li>' +
              '<li><a title="v" class="fitBtn" id="fitVertical"><span>━</span> Fit Horizontal</a></li>' +
              '<li><a title="h" class="fitBtn" id="fitHorizontal"><span>╋</span> Fit Both</a></li>' +
              '<li><a title="f" id="fullSpread"><span>🕮</span> Full Spread</a></li>' +
              '<li><a title="s" id="singlePage"><span>🗍</span> Single Page</a></li>' +
              '<li><a title="rendering" id="renderingChanger"><span>🖽</span> Rendering</a></li>' +
              '<li><a title="p" id="preloader">Preload<input id="preloadInput" type="text" value="100"></a></li>' +
            '</ul>'+
          '</li>'+
        '</ul>'+
      '</div>'+
    '</div>'+
  '</nav>';
  document.body.innerHTML += html;
};

var addImgFrame = function () {
  html =
  '<div id="comicImages" class="fitVertical" tabindex="1">' +
  // '<a id="leftBtn" class="imageBtn">&#11164;</a>' +
  '<a id="leftBtn" class="imageBtn"></a>' +
  // '<a id="imageDragger"></a>'+
  // '<a id="rightBtn" class="imageBtn">&#11166;</a>' +
  '<a id="rightBtn" class="imageBtn"></a>' +
  '<div class="centerer"></div>'+
  '</div>' +
  '<div id="preload"></div>';
  document.body.innerHTML += html;
};

// prevent dropdown from close
$('.dropdown-menu').on('click', function(e) {
  e.stopPropagation();
});
///////////////////////////////////////////////////////////////////

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

var simpleRequest = function (url, callback, method, headers, data, error) {
  var details = {
    method: method ? method : 'GET',
    url: url,
    timeout: 10000,
    ontimeout: function (e) {
      error(e);
    }
  };
  if (callback) {
    details.onload = function (response) {
      callback(response);
    };
  }
  if (headers) {
    details.headers = headers;
    for (var prop in details.headers) {
      if (details.headers.hasOwnProperty(prop)) {
        if (prop.toLowerCase() == 'content-type' && details.headers[prop].match(/multipart\/form-data/)) {
          details.binary = true;
        }
      }
    }
  }
  if (data) {
    details.data = data;
  }
  if (error) {
    details.onerror = error;
  }
  xmlhttpRequest(details);
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

//////////////////////////////////////////////////////////////////

var user_lang = function () {
  var userLang = navigator.language || navigator.userLanguage;
  return userLang.toLowerCase();
};
var is_english = function () {
  var userLang = user_lang();
  return /^en/.test(userLang);
};
var is_japanese = function () {
  var userLang = user_lang();
  return /^ja/.test(userLang);
};
function eachWord(str) {
  return str.replace(/\w\S*/g, function (txt) {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
};
var disable = function (elem) {
  elem.parent().addClass('disabled');
  elem.children().removeClass('icon_white');
};
var enable = function (elem) {
  elem.parent().removeClass('disabled');
  elem.children().addClass('icon_white');
};

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

var getGdata = function (gid, token, callback) {
  var data = {
    'method': 'gdata',
    'gidlist': [
      [gid,
      token]
    ]
  };
  simpleRequest(API_URL, callback, 'POST', {
  }, JSON.stringify(data)
  );
};

var parseHTML = function (response) {
  var doc = document.implementation.createHTMLDocument('temp');
  doc.documentElement.innerHTML = response.responseText;
  return doc;
};

///////////////////////////////////////////////////////////////

var openInNewTab = function (url) {
  var win = window.open(url, '_blank');
  win.focus();
};

var checkUpdate = function () {
  var github_api = "https://api.github.com";
  var repo_path = "/repos/skygarlics/exhviewer";
  // past version
  var p_version = 171030;
  simpleRequest(github_api + repo_path + '/releases/latest', (response) => {
    resp_json = JSON.parse(response.responseText);
    var n_version = parseInt(resp_json["tag_name"]);
    var url = resp_json["assets"][0]["browser_download_url"];
    if ((p_version < n_version) && confirm("새 버전 : " + n_version + "\n업데이트 하시겠습니까?")) {
        alert("설치 후 새로고침하면 새 버전이 적용됩니다.");
        openInNewTab(url);
    }
  });
};

////////////////////////////////////////////////////////////////

var renderChange = function () {
  renderType = (renderType + 1) % 3;
  // var renderStyle = document.getElementById('renderStyle');
  if (renderType === 0) {
      renderStyle.textContent = 'img {image-rendering: optimizeQuality; image-rendering: -webkit-optimize-contrast;}';
      document.getElementById('renderingChanger').innerHTML = '<span>🖽</span> Render: optimized';
  }
  if (renderType === 1) {
      renderStyle.textContent = 'img {image-rendering: auto;}';
      document.getElementById('renderingChanger').innerHTML = '<span>🖽</span> Render: auto';
  }
  if (renderType === 2) {
      renderStyle.textContent = 'img {image-rendering: -moz-crisp-edges; image-rendering: pixelated;}';
      document.getElementById('renderingChanger').innerHTML = '<span>🖽</span> Render: pixelated';
  }
};

var pageChanged = function () {
  var n_panel = Number(curPanel);
  if (n_panel) {
    if (display == 2 && n_panel <= number_of_images && n_panel > 0) {
      fullSpread();
    } else if (display == 1 && n_panel <= number_of_images && n_panel > 0) {
      singleSpread();
    } else {
      singleSpread();
    }
  } else {
    //fullSpread();
    singleSpread();
  }

  if (n_panel == 1) {
    disable($('#prevPanel'));
  }

  if (n_panel >= number_of_images) {
    disable($('#nextPanel'));
  }
};


var singlePageChange = function ( ){
    var val = document.getElementById('single-page-select').value;
    enable($('#prevPanel'));
    enable($('#nextPanel'));
    if (val == 1) {
      disable($('#prevPanel'));
    } else if (val == number_of_images) {
      disable($('#nextPanel'));
    }
    curPanel = val;
    pageChanged();
    //drawPanel();
    $('#single-page-select').trigger('blur');
};


var twoPageChange = function () {
  //consle.log('twoPageChange called');
    //console.log('twoPageChange called');
    var val = document.getElementById('two-page-select').value;
    enable($("#prevPanel"));
    enable($("#nextPanel"));
    if (val == 1) {
      disable($('#prevPanel'));
    } else if (val == number_of_images) {
      disable($('#nextPanel'));
    }
    curPanel = val;
    pageChanged();
    $("#two-page-select").trigger("blur");
};

var curDown = false;
var prevX, prevY;

var imgDrag = function (e) {
  if (curDown) {
    if (e.pageX > 0) {
      comicImages.scrollLeft += prevX - e.pageX;
      prevX = e.pageX;
    }
    if (e.pageY > 0) {
      comicImages.scrollTop += prevY - e.pageY;
      prevY = e.pageY;
    }
  }
};

var imgDragStart = function (e) {
  prevX = e.pageX;
  prevY = e.pageY;
  curDown = true;
};

var imgDragEnd = function (e) {
  curDown = false;
};


var doWheel = function (e) {
    const prevScrollTop = comicImages.scrollTop;
    comicImages.scrollTop += e.deltaY;
  
    requestAnimationFrame(() => {
      if (comicImages.scrollTop === prevScrollTop) {
        e.deltaY > 0 ? nextPanel() : prevPanel();
      }
    });
};

var toggleTimer = function () {
    //console.log('toggleTimer called');
    var second = document.getElementById('pageTimer').value;
    if (second < 1 || isNaN(second)) {
        return;
    }

    toggleTimer.flag = !toggleTimer.flag
    var pagerButton = document.getElementById('autoPager');

    if (toggleTimer.flag) {
        pagerButton.firstChild.classList.add('icon_white');
        toggleTimer.interval = setInterval(nextPanel, second * 1000);
    } else {
        pagerButton.firstChild.classList.remove('icon_white');
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
      fullSpread();
      break;
    case 's':
      singleSpread();
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
  if (num == 1){
    $("#single-page-select option:selected").prop("selected", false);
    $("#single-page-select option").each(function() {
      if ($(this).val() == curPanel) {
        $(this).prop("selected", true);
        //$(this).parent().trigger("change");
      }
    });
  } else if (num == 2) {
    //var re = /^(\d+)-(\d*)$/;
    $("#two-page-select option:selected").prop("selected", false);
    $("#two-page-select option").each(function() {
      if ($(this).val() == curPanel) {
        $(this).prop("selected", true);
        //$(this).parent().trigger("change");
      }
    });
  }
};

var updateImgsAndCallAsync = async function(start, end) {
    if (end < start) {
      console.error("Error in updateImgsAndCall: start is greater than end");
      return;
    }
  
    // `start`와 `end`의 범위 내 유효한 이미지 인덱스를 계산합니다.
    const update_entry = [];
    for (let idx = Math.max(start, 1); idx < Math.min(end, number_of_images + 1); idx++) {
      update_entry.push(idx - 1);
    }
  
    // 비동기 이미지 업데이트 처리
    const promise_entry = update_entry.map(async (idx) => {
      const img = images[idx];
      if (img && img.updated === true) return;
      await new Promise((resolve) => updateImg(img, resolve));
    });
  
    // 모든 이미지가 업데이트된 후 콜백 호출
    await Promise.all(promise_entry);
};


var drawPanel = function () {
    n_curPanel = parseInt(curPanel);
    updateImgsAndCallAsync(n_curPanel, n_curPanel+2)
        .then(drawPanel_);
};

var reloadImg = function () {
  //console.log('reloadImg called');
  var entry = [Number(curPanel), Number(curPanel)-1];
  for (var idx = 0; idx < entry.length; idx++) {
    var img = images[entry[idx]];
    //console.log('url :'+img.url);
    img.url = img.url.replace(/\?.*/, '');
    img.url += ((img.url + '').indexOf('?') > - 1 ? '&' : '?') + "nl=" + img.nl;
    img['updated'] = false;
    img.nl = null;
  }
  drawPanel();
};

var updateImg = function (img, callback) {
  //console.log('updateImg called. img_num : ' + img.page);
  simpleRequest(img.url, function (response) {
    var doc = parseHTML(response);
    var file_info = doc.getElementById('i4').firstChild.firstChild.textContent;
    var file_info_regex = /^(?:.*?) :: (\d+) x (\d+).*$/g;
    var match = file_info_regex.exec(file_info);
    img['path'] = doc.getElementById('img').src;
    img['width'] = Number(match[1]);
    img['height'] = Number(match[2]);
    img['updated'] = true;

    var nl_regex = /^return nl\('(.*)'\)$/g;
    var nl_match = nl_regex.exec(doc.getElementById("loadfail").attributes["onclick"].nodeValue);
    img['nl'] = nl_match[1];
    callback();
  });
};

var preloader = function() {
  var len = document.getElementById('preloadInput').value;
  preloadImage(len);
}

var preloadImage = async function(length) {
    const currentPanel = parseInt(curPanel);
    n_curPanel = currentPanel;

    // 이미지 업데이트 호출 및 완료 후 처리
    await updateImgsAndCallAsync(n_curPanel - 2, n_curPanel + length + 1);

    // 필요한 이미지를 미리 로드
    const preloadContainer = $('#preload');
    const imagesToPreload = [];
    for (let idx = 0; idx < length; idx++) {
        const panelIndex = currentPanel + idx;
        if (panelIndex < number_of_images) {
            const image = $('<img />', { src: images[panelIndex].path });
            imagesToPreload.push(image);
        }
    }

    // 한 번에 이미지 요소 추가
    preloadContainer.append(imagesToPreload);
};


// original drawPanel()
var drawPanel_ = function () {
    const preloadContainer = $('#preload').empty();
    const comicImagesContainer = $('#comicImages').empty();
    const currentPanel = Number(curPanel);
    const totalImages = Number(number_of_images);
    const singleDisplay = display === 1;
    
    $('body').attr('class', singleDisplay ? 'spread1' : 'spread2');
  
    if (!singleDisplay && currentPanel > 1 && currentPanel < totalImages) {
      const currentImage = images[currentPanel];
      const previousImage = images[currentPanel - 1];
      
      if (currentImage.width <= currentImage.height && previousImage.width <= previousImage.height) {
        // 두 이미지를 추가하여 spread2 모드로 표시
        const imgElements = [
          $('<img />', { src: currentImage.path }),
          $('<img />', { src: previousImage.path })
        ];
        comicImagesContainer.append(imgElements);
        preloadImage(3);
      } else {
        // 하나의 이미지만 추가하여 spread1 모드로 표시
        comicImagesContainer.append(
          $('<img />', { src: images[currentPanel - 1].path })
        );
        preloadImage(2);
      }
    } else if (currentPanel <= totalImages) {
      // display == 1 또는 조건에 맞지 않는 경우 한 개의 이미지만 표시
      comicImagesContainer.append(
        $('<img />', { src: images[currentPanel - 1].path })
      );
      preloadImage(2);
    }
  
    // 버튼에 대한 이벤트 리스너가 이미 설정되어 있을 경우 중복 추가를 방지
    if (!drawPanel_.listenersAdded) {
      document.getElementById('leftBtn').addEventListener('click', prevPanel);
      document.getElementById('rightBtn').addEventListener('click', nextPanel);
      drawPanel_.listenersAdded = true;
    }
  
    comicImagesContainer.scrollTop(0);
    $('body').scrollTop(0);
  };
  

  var goPanel = function () {
    const target = parseInt(prompt('target page'), 10);
  
    // target이 NaN이 아니고, 지정된 범위 내에 있을 때만 패널을 변경
    if (Number.isInteger(target) && target >= 0 && target <= number_of_images) {
      panelChange(target);
    }
  };

var panelChange = function (target) {
  if (display == 1) {
    $('#single-page-select').prop('selectedIndex', target - 1);
    singlePageChange();
  } else {
    $('#two-page-select').prop('selectedIndex', target - 1);
    twoPageChange();
  }
};

var prevPanel = function () {
    const currentPanel = parseInt(curPanel, 10);
  
    if (currentPanel <= 1) return;
  
    if (display === 1) {
      panelChange(currentPanel - 1);
    } else {
      const prevImage = images[currentPanel - 2];
      const newPanel = (currentPanel > 2 && prevImage.width <= prevImage.height) ? currentPanel - 2 : currentPanel - 1;
      panelChange(newPanel);
    }

    $('body').scrollTop(0);
};
  
var nextPanel = function () {
    const currentPanel = parseInt(curPanel, 10);
  
    if (currentPanel >= number_of_images) return;
  
    if (display === 1) {
      panelChange(currentPanel + 1);
    } else {
      const newPanel = (currentPanel + 1 < number_of_images && !single_displayed) ? currentPanel + 2 : currentPanel + 1;
      panelChange(newPanel);
    }
    $('body').scrollTop(0);
  };

var fullSpread = function () {
  //console.log('fullSpread called');
  $('#singlePage').parent().show();
  $('#fullSpread').parent().hide();
  $('#single-page-select').hide();
  $('#two-page-select').show();
  $('#singlePage').show();
  updateDropdown(2);
  spread(2);
};

var singleSpread = function () {
  //console.log('singleSpread called');
  $('#singlePage').parent().hide();
  $('#fullSpread').parent().show();
  $('#two-page-select').hide();
  $('#single-page-select').show();
  $('#fullSpread').show();
  updateDropdown(1);
  spread(1);
};

var spread = function (num) {
  $('body').removeClass('spread' + display);
  display = num;
  $('body').addClass('spread' + display);
  drawPanel();
};

var resetFit = function () {
  $('#comicImages').removeClass();
  $('.fitBtn').parent().hide();
};

var fitStretch = function () {
  // console.log('fitStretch called');
  resetFit();
  $('#comicImages').addClass('fitStretch');
  $('#fitBoth').parent().show();
  $('body').scrollTop(0);
};


var fitBoth = function () {
  // console.log('fitboth called');
  resetFit();
  $('#comicImages').addClass('fitBoth');
  $('#fitHorizontal').parent().show();
  $('body').scrollTop(0);
};

var fitHorizontal = function () {
  // console.log('fitHorizontal called');
  resetFit();
  $('#comicImages').addClass('fitHorizontal');
  $('#fitVertical').parent().show();
  $('body').scrollTop(0);
};

var fitVertical = function () {
  // console.log('fitVertical called');
  resetFit();
  $('#comicImages').addClass('fitVertical');
  $('#fitStretch').parent().show();
  $('body').scrollTop(0);
};

var fullscreen = function () {
  var elem = comicImages;
  if (!document.fullscreenElement) {
    elem.requestFullscreen?.() || elem.msRequestFullscreen?.() || elem.mozRequestFullScreen?.() || elem.webkitRequestFullscreen?.();
  } else {
    document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.() || document.msExitFullscreen?.();
  }
};


var init = async function () {
    if (update_check) {
        checkUpdate();
    }

    // clear page
    document.body.innerHTML = '';
    addNavBar();
    addImgFrame();
    clearStyle();

    var head = document.head;
    var link = document.createElement("link");
    link.type = "text/css";
    link.rel = "stylesheet";
    link.href = "https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css";
    head.appendChild(link);

    addStyle('div#i1 {display:none;} p.ip {display:none;}');
    addStyle(viewer_style);
    addStyle(fullscreen_style);
    document.body.setAttribute('class', 'spread1');
    comicImages = document.getElementById("comicImages");

    // set cur panel
    var url = document.location.href;
    curPanel = Number(url.substring(url.lastIndexOf('-') + 1));
    getToken()
        .then(token => getGdata(token.gid, token.token, setGallery));

    var setGallery = function (response) {
        // make image list
        var gmetadata = JSON.parse(response.responseText).gmetadata[0];
        number_of_images = gmetadata.filecount;
        createDropdown();
        var gallery_url = 'https://' + host + '/g/' + gmetadata.gid + '/' + gmetadata.token + '/?p=';

        // images[curPanel]={page:curPanel, width:unsafeWindow.x, height:unsafeWindow.y, path:document.getElementById("img").src, token:match[1], url:document.location};
        var gallery_page_len = Math.ceil(number_of_images / 40);

        // load current page. first things first
        var current_gallery_page = Math.ceil(curPanel / 40);
        var page_img_len;
        if (current_gallery_page < gallery_page_len) {
            // before last page of gallery images
            page_img_len = 40;
        } else {
        page_img_len = number_of_images - ((gallery_page_len - 1) * 40);
        }
        page_img_len = Number(page_img_len);

        var pushImgs = function (response) {
            var doc = parseHTML(response);
            var imgs = doc.querySelectorAll("#gdt > a");
            for (var idx = 0; idx < imgs.length; idx++) {
                var regex_temp = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
                var img = imgs[idx];
                var url_temp = img.href;
                var match_temp = regex_temp.exec(url_temp);
                images[match_temp[3] - 1] = {
                    page: match_temp[3],
                    url: url_temp,
                    token: match_temp[1]
                };
            }
        };

        // promise pattern
        new Promise(
        function(resolve, reject) {
            simpleRequest(gallery_url + (current_gallery_page - 1), function(resp){
            pushImgs(resp);
            resolve();
            });
        }).then(pageChanged);

        // load rest of galleries
        for (var i = 0; i < gallery_page_len; i++) {
            if (i !== current_gallery_page-1) {
                simpleRequest(gallery_url + i, pushImgs);
            }
        }
    };

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
    document.getElementById('fullSpread').addEventListener('click', fullSpread);
    document.getElementById('singlePage').addEventListener('click', singleSpread);
    document.getElementById('renderingChanger').addEventListener('click', renderChange);
    document.getElementById('reload').addEventListener('click', reloadImg);
    document.getElementById('preloader').addEventListener('click', preloader);
    document.getElementById('autoPager').addEventListener('click', toggleTimer);
    document.getElementById('pageChanger').addEventListener('click', goPanel);
    document.getElementById('single-page-select').addEventListener('change', singlePageChange);
    document.getElementById('two-page-select').addEventListener('change', twoPageChange);
    document.getElementById('comicImages').addEventListener('dragstart', imgDragStart);
    document.getElementById('comicImages').addEventListener('drag', imgDrag);
    document.getElementById('comicImages').addEventListener('dragend', imgDragEnd);
    $('.navbar ul li').show();
    $('#fullSpread').hide();
    $('#singlePage').hide();
    var docElm = document.documentElement;
    if (!docElm.requestFullscreen && !docElm.mozRequestFullScreen && !docElm.webkitRequestFullScreen && !docElm.msRequestFullscreen) {
        $('#fullscreen').parent().hide();
    }
    renderChange();
    fitVertical();
};

init();
