// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       171117
// @author        aksmf
// @description   image viewer for exhentai
// @include       https://exhentai.org/s/*
// @include       https://e-hentai.org/s/*
// @version       1
// @require       https://code.jquery.com/jquery-3.2.1.min.js
// @require       https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js
// @resource      bt https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css
// @grant         GM_xmlhttpRequest
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
var number_of_images;
var comicImages;
var single_displayed = true;
//var numThin = 0;
//var portrait = false;

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
var addStyleFromResource = async function asdf (res) {
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
  ".fitVertical:fullscreen img {max-height: 100% !important;}";

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
        '<button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#collapseNavbar"><span class="icon-bar"></span><span class="icon-bar"></span><span class="icon-bar"></span> </button>'+
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
              '<li><a title="b" class="fitBtn" id="fitBoth"><span>┃</span> Fit Vertical</a></li>' +
              '<li><a title="v" class="fitBtn" id="fitVertical"><span>━</span> Fit Horizontal</a></li>' +
              '<li><a title="h" class="fitBtn" id="fitHorizontal"><span>╋</span> Fit Both</a></li>' +
              '<li><a title="f" id="fullSpread"><span>🕮</span> Full Spread</a></li>' +
              '<li><a title="s" id="singlePage"><span>🗍</span> Single Page</a></li>' +
              '<li><a title="rendering" id="renderingChanger"><span>🖽</span> Rendering</a></li>' +
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
var getToken = function (callback) {
  var page_regex = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
  var match = page_regex.exec(document.location);
  var data = {
    'method': 'gtoken',
    'pagelist': [
      [
      match[2],
      match[1],
      match[3]
      ]
    ]
  };
  simpleRequest(API_URL, callback, 'POST', {
  }, JSON.stringify(data)
  );
};

function goGallery() {
  getToken(function (response) {
    ids = JSON.parse(response.responseText).tokenlist[0];
    location.href = 'https://' + host + '/g/' + ids.gid + '/' + ids.token;
  });
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

var hashChanged = function () {
  var n_panel = Number(curPanel);
  if (n_panel) {
    if (display == 2 && n_panel <= number_of_images && n_panel > 0) {
      fullSpread();
    } else if (display == 1 && n_panel <= number_of_images && n_panel > 0) {
      singleSpread();
    } else {
      console.log('error on hashChanged');
      console.log('all conditions down below have to be true');
      console.log('display == 1', display == 1);
      console.log('n_panel <= number_of_images', n_panel <= number_of_images);
      console.log('n_panel > 0', n_panel > 0);
      console.log('display: ', display, ', n_panel: ', n_panel, ',number_of_images: ', number_of_images);
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

// original page changers
var singlePageChange_ = function (sel) {
  // console.log('singlePageChange called');
  var val = sel.value;
  enable($('#prevPanel'));
  enable($('#nextPanel'));
  if (val == 1) {
    disable($('#prevPanel'));
  } else if (val == number_of_images) {
    disable($('#nextPanel'));
  }
  curPanel = val;
  hashChanged();
  //drawPanel();
  $('#single-page-select').trigger('blur');
};

var singlePageChange = function ( ){
  //console.log('singlePageChange called');
  singlePageChange_(document.getElementById('single-page-select'));
};

var twoPageChange_ = function (sel) {
  //console.log('twoPageChange called');
  var val = sel.value;
  enable($("#prevPanel"));
  enable($("#nextPanel"));
  if (val == 1) {
    disable($('#prevPanel'));
  } else if (val == number_of_images) {
    disable($('#nextPanel'));
  }
  curPanel = val;
  hashChanged();
  $("#two-page-select").trigger("blur");
};

var twoPageChange = function () {
  //consle.log('twoPageChange called');
  twoPageChange_(document.getElementById('two-page-select'));
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
  let prev_scrollTop = comicImages.scrollTop;
  // let scrollTo = prev_scrollTop + e.deltaY;
  // comicImages.scrollTop = scrollTo;
  setTimeout(() => {
    if (comicImages.scrollTop == prev_scrollTop){
      if (e.deltaY > 0)
        nextPanel();
      else if (e.deltaY < 0)
        prevPanel();
    }
  }, 50);
};

var toggleTimer = function () {
  //console.log('toggleTimer called');
  var second = document.getElementById('pageTimer').value;
  if (second < 1 || isNaN(second)) {
    return;
  }
  toggleTimer.flag = toggleTimer.flag ? 0 : 1;
  if (toggleTimer.flag) {
    var pagerButton = document.getElementById('autoPager');
    pagerButton.firstChild.classList.add('icon_white');
    toggleTimer.interval = setInterval(nextPanel, second * 1000);
  } else {
    var pagerButton = document.getElementById('autoPager');
    pagerButton.firstChild.classList.remove('icon_white');
    clearInterval(toggleTimer.interval);
  }
};

var doHotkey = function (e) {
  var key = e.keyCode;
  switch (key) {
    case 74:
      //alert('J paressed');
      nextPanel();
      break;
    case 81:
      //alert('Q pressed');
      nextPanel();
      break;
    case 37:
      //alert('LEFT pressed');
      nextPanel();
      break;
    case 75:
      //alert('K pressed');
      prevPanel();
      break;
    case 69:
      //alert('E pressed');
      prevPanel();
      break;
    case 39:
      //alert('RIGHT pressed')
      prevPanel();
      break;
    case 66:
      //alert('B pressed')
      fitBoth();
      break;
    case 86:
      //alert('V pressed')
      fitVertical();
      break;
    case 72:
      //alert('H pressed')
      fitHorizontal();
      break;
    case 70:
      //alert('F pressed')
      fullSpread();
      break;
    case 83:
      //alert('S pressed')
      singleSpread();
      break;
    case 13:
      //alert('ENTER pressed')
      fullscreen();
      break;
    case 32:
      //alert('SPACE pressed')
      fullscreen();
      break;
    case 84:
      //alert('T pressed');
      toggleTimer();
      break;
    case 82:
      //alert('R pressed');
      reloadImg();
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

var drawPanel = function () {
  // console.log('drawPanel() called curPanel: '+ curPanel);
  // set before call drawPanel_()
  // update_entry fills from idx-2 to idx+4
  var update_entry = [];
  for (var idx = -2; idx < 5; idx++) {
    var idx_temp = Number(curPanel) + idx;
    if (!(idx_temp < 1) && !(idx_temp > number_of_images)) {
      update_entry.push(idx_temp - 1);
    }
  }
  //console.log(update_entry);

  var promise_entry = [];
  for (var idx = 0; idx < update_entry.length; idx++) {
    var img = images[update_entry[idx]];
    promise_entry.push(new Promise(function(resolve, reject){
      if (img['updated'] === true) {
        resolve();
      }
      else {
        updateImg(img, resolve);
      }
    }));
  }

  Promise.all(promise_entry).then(function() {
    drawPanel_();
  });
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

// original drawPanel()
var drawPanel_ = function () {
  // console.log('drawPanel_ called display:' + display);
  $('#preload').empty();
  // $('#comicImages').empty();
  var imgs = comicImages.getElementsByTagName('img');
  while (imgs.length > 0) {
    comicImages.removeChild(imgs[0]);
  }
  // var img_len = imgs.length;
  //for (var idx = 0; idx < img_len; idx++) {
  //  comicImages.removeChild(imgs[0]);
  //}
  $('body').removeClass();
  $('body').addClass('spread1');
  if (display == 2) {
    if (curPanel > 1 && Number(curPanel) < Number(number_of_images) && images[curPanel].width <= images[curPanel].height && images[curPanel - 1].width <= images[curPanel - 1].height) {
      // display curPanel + curPanel - 1. except panel 1
      var image = $('<img />', {
        src: images[curPanel].path,
        //onclick: 'nextPanel()'
      });
      $('#comicImages').append(image);
      image = $('<img />', {
        src: images[curPanel - 1].path,
        //onclick: 'prevPanel()'
      });
      $('#comicImages').append(image);
      $('body').removeClass();
      $('body').addClass('spread2');
      single_displayed = false;
      
      for (var idx = 0; idx < 3; idx++) {
        if (parseInt(curPanel) + idx < number_of_images) {
          var image = $('<img />', {
            src: images[parseInt(curPanel) + idx].path
          });
          $('#preload').append(image);
        }      
      }
      
    } else if (Number(curPanel) <= Number(number_of_images)) {
      image = $('<img />', {
        src: images[Number(curPanel) - 1].path,
        //onclick: 'nextPanel()'
      });
      $('#comicImages').append(image);
      single_displayed = true;
      
      // curPanel==1 or width > height. display one panel
      if (Number(curPanel) < Number(number_of_images)) {
        var image = $('<img />', {
          src: images[curPanel].path
        });
        $('#preload').append(image);
      }
      if (Number(curPanel) + 1 < Number(number_of_images)) {
        image = $('<img />', {
          src: images[parseInt(curPanel) + 1].path
        });
        $('#preload').append(image);
      }
    } else {
      // console.log('ERROR');
    }
  } else {
  // display == 1
    var image = $('<img />', {
      src: images[Number(curPanel) - 1].path,
    });
    
    $('#comicImages').append(image);
    
    for (var idx = 0; idx < 2; idx++) {
      if (parseInt(curPanel) + idx < number_of_images) {
        var image = $('<img />', {
          src: images[parseInt(curPanel) + idx].path
        });
        $('#preload').append(image);
      }      
    }
  }
  document.getElementById('leftBtn').addEventListener('click', nextPanel);
  document.getElementById('rightBtn').addEventListener('click', prevPanel);
  $('#comicImages').scrollTop(0);
  $('body').scrollTop(0);
  // $('#comicImages').focusWithoutScrolling();
};

var filterInt = function (value) {
  if(/^(\-|\+)?([0-9]+)$/.test(value))
    return Number(value);
  return NaN;
};

var goPanel = function () {
  let target = filterInt(prompt('target page'));
  if (isNaN(target) || (target < 0)|| (target > number_of_images))
    return;
  panelChange(target);
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
  // console.log('prevPanel called');
  curPanel = parseInt(curPanel);
  if (display == 1) {
    if (curPanel > 1) {
      panelChange(curPanel - 1);
    }
  } else {
    if (curPanel > 1) {
      if ((curPanel > 2) && (images[curPanel - 2].width <= images[curPanel - 2].height)) {
        panelChange(curPanel - 2);
      } else {
        panelChange(curPanel - 1);
      }
    }
  }
  // $('#comicImages').focusWithoutScrolling();
  $('body').scrollTop(0);
};

var nextPanel = function () {
  // console.log('nextPanel called');
  curPanel = parseInt(curPanel);
  if (display == 1) {
    if (curPanel < number_of_images) {
      panelChange(curPanel + 1);
    }
  } else {
    if (curPanel < number_of_images) {
      if ((curPanel + 1 < number_of_images) && !(single_displayed)) {
        panelChange(curPanel + 2);
      } else {
        panelChange(curPanel + 1);
      }
    }
  }
  // $('#comicImages').focusWithoutScrolling();
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
  if (display == 2) {
    /* original logic
    var found = false;
    var pattern = curPanel + '-';
    var () = $('#two-page-select option').each(function  {
      if ($(this).val().search(pattern) > - 1) {
        found = true;
      }
    });
    if (!found) {
      --curPanel;
    }
    */
  }
  drawPanel();
};

var resetFit = function () {
  $('#comicImages').removeClass();
  $('.fitBtn').parent().hide();
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
  $('#fitBoth').parent().show();
  $('body').scrollTop(0);
};

var fullscreen = function () {
  var isInFullScreen = (document.fullscreenElement && document.fullscreenElement !== null) ||
    (document.webkitFullscreenElement && document.webkitFullscreenElement !== null) ||
    (document.mozFullScreenElement && document.mozFullScreenElement !== null) ||
    (document.msFullscreenElement && document.msFullscreenElement !== null);
  // console.log('fullscreen called');
  var elem = comicImages;
  if (!isInFullScreen) {
    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.msRequestFullscreen) {
      elem.msRequestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      elem.webkitRequestFullscreen();
    }
  } else {
    if (document.exitFullscreen) {
        document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
        document.msExitFullscreen();
    }
  }
};

var init = function () {
  if (update_check) {
    checkUpdate();
  }

  // clear page
  document.body.innerHTML = '';

  addNavBar();
  addImgFrame();

  clearStyle();
  addStyleFromResource('bt');
  addStyle('div#i1 {display:none;} p.ip {display:none;}');
  addStyle(viewer_style);
  addStyle(fullscreen_style);
  document.body.setAttribute('class', 'spread1');

  comicImages = document.getElementById("comicImages");

  // set cur panel
  var page_regex = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
  var match = page_regex.exec(document.location);
  curPanel = Number(match[3]);
  getToken(function (response) {
    var ids = JSON.parse(response.responseText).tokenlist[0];
    getGdata(ids.gid, ids.token, setGallery);
  });

  var setGallery = function (response) {
    var pushImgs = function (response) {
      var doc = parseHTML(response);
      var imgs = doc.getElementsByClassName('gdtm');
      for (var idx = 0; idx < imgs.length; idx++) {
        var regex_temp = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
        var img = imgs[idx];
        var url_temp = img.firstChild.firstChild.href;
        var match_temp = regex_temp.exec(url_temp);
        images[match_temp[3] - 1] = {
          page: match_temp[3],
          url: url_temp,
          token: match_temp[1]
        };
      }
    };

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
      page_img_len = 40;
    } else {
      page_img_len = number_of_images - ((gallery_page_len - 1) * 40);
    }
    page_img_len = Number(page_img_len);

    // promise pattern
    var p1 = new Promise(
      function(resolve, reject) {
        simpleRequest(gallery_url + (current_gallery_page - 1), function(resp){
          pushImgs(resp);
          resolve();
        });
      }
    );
    p1.then(function() {
      hashChanged();
    });

    // load rest of galleries
    for (var i = 0; i < gallery_page_len; i++) {
      if (i == current_gallery_page-1) {
        //already loaded
      }
      else {
        simpleRequest(gallery_url + i, pushImgs);
      }
    }
  };
  document.addEventListener('keydown', doHotkey);
  // document.getElementById('galleryInfo').addEventListener('click', goGallery);
  getToken(function (response) {
    ids = JSON.parse(response.responseText).tokenlist[0];
    document.getElementById('galleryInfo').href = 'https://' + host + '/g/' + ids.gid + '/' + ids.token;
  });
  document.addEventListener('wheel', doWheel);
  document.getElementById('prevPanel').addEventListener('click', prevPanel);
  document.getElementById('nextPanel').addEventListener('click', nextPanel);
  document.getElementById('fitBoth').addEventListener('click', fitBoth);
  document.getElementById('fitVertical').addEventListener('click', fitVertical);
  document.getElementById('fitHorizontal').addEventListener('click', fitHorizontal);
  document.getElementById('fullscreen').addEventListener('click', fullscreen);
  document.getElementById('fullSpread').addEventListener('click', fullSpread);
  document.getElementById('singlePage').addEventListener('click', singleSpread);
  document.getElementById('renderingChanger').addEventListener('click', renderChange);
  document.getElementById('reload').addEventListener('click', reloadImg);
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
  fitBoth();
};
init();
