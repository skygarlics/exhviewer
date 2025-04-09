// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       250410
// @author        aksmf
// @description   image viewer for exhentai
// @include       https://exhentai.org/s/*
// @include       https://e-hentai.org/s/*
// @require       https://code.jquery.com/jquery-3.2.1.min.js
// @resource bs_js https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_deleteValue
// @grant         GM_listValues
// @grant         GM_getResourceText
// @grant		  GM.getResourceUrl
// ==/UserScript==


(function() {
'use strict';
class EXHaustViewer {
    // Viewer elements
    iframe = null;
    iframe_jq = null;
    comicImages;

    update_check = false;
    PanelListenerAdded = false;
    set_spread = 1;
    class_spread = 1;
    is_single_displayed = true;
    timerflag = false;
    timerInterval = null;
    renderType = 0;
    renderStyle;

    dragState = {
        isDragging: false,
        prevX: 0,
        prevY: 0
    };

    images = {}; // image datas (url, width, height, path, nl, updated), 0-indexed
    curPanel = 1; // current panel number (1-indexed, always has to be integer)

    #number_of_images;
    get number_of_images() {
        return this.#number_of_images;
    }
    set number_of_images(value) {
        this.#number_of_images = value;
        this.createPageDropdown();
    }

    #gallery_url;
    get gallery_url() {
        return this.#gallery_url;
    }
    set gallery_url(value) {
        this.#gallery_url = value;

        var gallery_info = this.iframe.contentDocument.getElementById('galleryInfo');
        if (!gallery_info) {
            return;
        }

        if (this.#gallery_url) {
            gallery_info.href = this.#gallery_url
        }
    }

    constructor(curPanel) {
        if (!curPanel) {
            curPanel = 1;
        }
        this.curPanel = curPanel;
        this.addIframe();
        this.iframe.onload = () => this.init();
    }

    async init() {
        this.body = this.iframe.contentDocument.body;
        this.renderStyle = this.addRenderStyle(this.iframe.contentDocument);
        this.comicImages = this.iframe.contentDocument.getElementById('comicImages');
        // prevent dropdown from close
        $('.dropdown-menu', this.iframe_jq.contents()).on('click', function(e) {
            e.stopPropagation();
        });

        this.iframe.contentDocument.body.setAttribute('class', 'spread1');
        //this.addStyle('div#i1 {display:none;} p.ip {display:none;}');

        this.addEventListeners(this.iframe.contentDocument);
        this.addFullscreenHandler(this.iframe.contentDocument);

        $('.navbar ul li', this.iframe_jq.contents()).show();
        $('#fullSpread', this.iframe_jq.contents()).hide();

        this.renderChange(this.iframe.contentDocument);
        this.fitStretch();

        var docElm = this.iframe.contentDocument.documentElement;
        if (!docElm.requestFullscreen && !docElm.mozRequestFullScreen && !docElm.webkitRequestFullScreen && !docElm.msRequestFullscreen) {
            $('#fullscreen', this.iframe_jq.contents()).parent().hide();
        }

        $('#single-page-select', this.iframe_jq.contents()).prop('selectedIndex', this.curPanel - 1);
    }

    finally = this.pageChanged;

    // ==============  ==============
    // these functions can be overridden by nenecessary
    prevEpisode() {
        return;
    }

    nextEpisode() {
        return;
    }

    getReloadInfo = async (entry_idx, entry_url) => {
        // in default, it just returns original path
        return images[entry_idx].path;
    };

    extractImageData = async (url, idx) => {
        // in default, it just return nothing
        return {}
    }

    // ============== setup functions ==============
    saveConfig(key, value) {
        return GM_setValue(key, value);
    }

    loadConfig(key) {
        return GM_getValue(key);
    }

    addShowbutton(selector) {
        var target = document.querySelector(selector);

        var btn = document.createElement('a');
        btn.id = 'enableViewer';
        btn.innerHTML = 'Viewer';
        btn.onclick = ()=>this.toggleViewer();
        target.appendChild(btn);
    }

    // Viewer iframe
    addIframe() {
        var iframe = document.createElement('iframe');
        iframe.id = 'exhaustviewer';
        var src = document.location.href
        //iframe.src = src;

        iframe.style.position = 'fixed';
        iframe.style.top = '0';
        iframe.style.left = '0';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.zIndex = '9999';
        iframe.style.display = 'none';

        var bs_js = GM_getResourceText('bs_js');

        iframe.srcdoc = `<!DOCTYPE html><html>
            <head>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.3/font/bootstrap-icons.css">
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH" crossorigin="anonymous">
                <script>${bs_js}</script>
                <style>
                    ${this.viewer_style}
                    ${this.fullscreen_style}
                </style>
            </head>
            <body>
                ${this.navbarHTML}
                ${this.imgFrameHTML}
            </body></html>`;
        document.body.appendChild(iframe);
        this.iframe = iframe;
        this.iframe_jq = $(iframe);

        return iframe;
    }

    addRenderStyle(docu) {
        // Image rendering option. needs ID to render swap
        var parent = docu.head || docu.documentElement;
        var style = docu.createElement('style');
        style.type = 'text/css';
        var renderStyle = docu.createTextNode('');
        renderStyle.id = 'renderStyle';
        style.appendChild(renderStyle);
        parent.appendChild(style);
        return renderStyle;
    }

    addHTML(code) {
        var body = this.iframe.contentDocument.body;
        body.innerHTML += code;
    }

    createPageDropdown() {
        // clear previous dropdown
        $('#single-page-select', this.iframe_jq.contents()).empty();
        for (var i = 1; i <= this.number_of_images; i++) {
            var option = $('<option>', {
                html: '' + i,
                value: i
            });
            $('#single-page-select', this.iframe_jq.contents()).append(option);
        }
    }

    setGalleryTitle(text, title) {
        var gallery_info = this.iframe.contentDocument.getElementById('galleryInfo');
        if (gallery_info == null) {
            console.log("galleryInfo is null");
            return;
        }

        if (text) {
            gallery_info.textContent = text;
        }

        if (title) {
            gallery_info.title = title;
        }
    }

    addEventListeners(docu) {
        docu.addEventListener('keydown', (e) => this.doHotkey(e));
        docu.addEventListener('wheel', (e) => {
            this.doWheel(e)
            // ensure wheel don't propagae to parent
            e.stopPropagation();
            e.preventDefault();
        }, { passive: false });
        docu.getElementById('prevPanel').addEventListener('click', ()=>this.prevPanel());
        docu.getElementById('nextPanel').addEventListener('click', ()=>this.nextPanel());
        docu.getElementById('fitStretch').addEventListener('click', ()=>this.fitStretch());
        docu.getElementById('fitBoth').addEventListener('click', ()=>this.fitBoth());
        docu.getElementById('fitVertical').addEventListener('click', ()=>this.fitVertical());
        docu.getElementById('fitHorizontal').addEventListener('click', ()=>this.fitHorizontal());
        docu.getElementById('fullscreen').addEventListener('click', ()=>this.fullscreen());
        docu.getElementById('fullscreener').addEventListener('click', ()=>this.fullscreen());
        docu.getElementById('fullSpread').addEventListener('click', ()=>this.setSpread(1));
        docu.getElementById('singlePage').addEventListener('click', ()=>this.setSpread(2));
        docu.getElementById('renderingChanger').addEventListener('click', () => this.renderChange());
        docu.getElementById('reload').addEventListener('click', ()=>this.reloadImg());
        docu.getElementById('preloader').addEventListener('click', ()=>this.preloader());
        docu.getElementById('autoPager').addEventListener('click', () => this.toggleTimer());
        docu.getElementById('pageChanger').addEventListener('click', () => this.goPanel());
        docu.getElementById('single-page-select').addEventListener('change', ()=>this.selectorChanged());
        docu.getElementById('comicImages').addEventListener('dragstart', (e) => this.imgDragStart(e));
        docu.getElementById('comicImages').addEventListener('drag', (e) => this.imgDrag(e));
        docu.getElementById('comicImages').addEventListener('dragend', () => this.imgDragEnd());
        docu.getElementById('viewerCloser').addEventListener('click', () => this.closeViewer());
        docu.getElementById('galleryInfo').addEventListener('click', () => this.goGallery());
    }

    // ============== Dangerous functions ==============
    // functions affects WHOLE page
    clearStyle() {
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
    }

    clearHotkeys() {
        // remove original events.
        document.onkeydown = null;
        document.onkeyup = null;
    }

    addStyle(css) {
        var doc = this.iframe.contentDocument;
        var parent = doc.head || doc.documentElement;
        var style = doc.createElement('style');
        style.type = 'text/css';
        var textNode = doc.createTextNode(css);
        style.appendChild(textNode);
        parent.appendChild(style);
    }

    disable(elem) {
        elem.parent().addClass('disabled');
        elem.children().removeClass('icon_white');
    }

    enable(elem) {
        elem.parent().removeClass('disabled');
        elem.children().addClass('icon_white');
    }

    // ============== Draw functions ==============
    drawPanel_() {
        const comicImagesContainer = $('#centerer', this.iframe.contentDocument);
        const currentPanel = this.curPanel;
        const totalImages = this.number_of_images;
        const singleSpread = this.set_spread === 1;

        // 기존 img 요소를 가져오거나 없는 경우 새로 추가
        let imgElements = comicImagesContainer.find('img');
        const requiredImageCount = singleSpread ? 1 : 2;

        while (imgElements.length < requiredImageCount) {
            $('<img />', this.iframe_jq.contents()).appendTo(comicImagesContainer);
            imgElements = comicImagesContainer.find('img'); // 추가 후 업데이트
        }

        if (!singleSpread && currentPanel > 1 && currentPanel < totalImages) {
            const currentImage = this.images[currentPanel];
            const previousImage = this.images[currentPanel - 1];

            // 이미지의 가로 세로 비율에 따라 두 이미지를 표시할지 결정
            // TODO : nextPanel, prevPanel에서도 계산되는거 제거하기?
            if (currentImage.width <= currentImage.height && previousImage.width <= previousImage.height) {
                // two image
                this.setSpreadClass(2);
                var rt_img = $(imgElements[1]);
                rt_img.addClass('rt_img');
                var lt_img = $(imgElements[0]);
                lt_img.addClass('lt_img');

                this.updateImageWithFadeIn(rt_img, previousImage.path);
                this.updateImageWithFadeIn(lt_img, currentImage.path);
                this.is_single_displayed = false;
                this.preloadImage(3);
            } else {
                // single image
                this.setSpreadClass(1);
                this.updateImageWithFadeIn($(imgElements[0]), previousImage.path);
                $(imgElements[1]).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
                this.is_single_displayed = true;
                this.preloadImage(2);
            }
        } else if (currentPanel <= totalImages) {
            // single image
            this.setSpreadClass(1);
            this.updateImageWithFadeIn($(imgElements[0]), this.images[currentPanel - 1].path);
            this.is_single_displayed = true;
            $(imgElements[1]).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
            this.preloadImage(2);
        }

        if (!this.PanelListenerAdded) {
            $('#leftBtn', this.iframe_jq.contents()).on('click', ()=>this.nextPanel());
            $('#rightBtn', this.iframe_jq.contents()).on('click', ()=>this.prevPanel());
            this.PanelListenerAdded = true;
        }

        comicImagesContainer.scrollTop(0);
        $('body', this.iframe_jq.contents()).scrollTop(0);
    };

    drawPanel() {
        var n_curPanel = this.curPanel;
        this.updateImgsAndCallAsync(n_curPanel, n_curPanel+2)
        .then(()=>this.drawPanel_());
    };

    updateImageWithFadeIn(imgElement, newSrc) {
        // check if newSrc is undefined
        if (!newSrc) {
            //console.error("newSrc is undefined");
            return;
        }

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
            //imgElement.css('opacity', '0'); // 계속 숨김
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

    // ============== Image loading functions ==============
    setImgData(page, imgData) {
        this.images[page] = imgData;
    };

    async updateImgData(img, idx, callback) {
        if (!img || !img.url) {
            console.error("Invalid image data:", img);
            return;
        }

        try {
            // imgData structure
            // {url: string, width: number, height: number, path: string, updated: boolean}
            var imgData = await callback(img.url, idx)

            // 이미지 경로 및 크기 정보 업데이트

            if (imgData.path) img.path = imgData.path;
            if (imgData.width) img.width = imgData.width;
            if (imgData.height) img.height = imgData.height;
            img.updated = true;
        } catch (error) {
            console.error("Error updating image:", error);
            throw error;  // 오류가 발생한 경우 상위로 throw하여 처리
        }
    };

    async updateImgsAndCallAsync(start, end) {

        if (end < start) {
        console.error("Error in updateImgsAndCall: start is greater than end");
        return;
        }

        const update_entry = [];
        for (let idx = Math.max(start, 1); idx < Math.min(end, this.number_of_images + 1); idx++) {
            update_entry.push(idx - 1);
        }

        const promise_entry = update_entry.map(async (idx) => {
            const img = this.images[idx];
            if (img && img.updated) return;  // 이미 업데이트된 경우 skip
            await this.updateImgData(img, idx, this.extractImageData);  // async 함수 호출
        });

        await Promise.all(promise_entry);
    };

    async reloadImg() {
        //console.log('reloadImg called');
        var n_curPanel = this.curPanel;

        // images[n_curPanel] = next page
        // if current page is last, entry current page only

        var entry_idx;
        var entry_url;

        if (n_curPanel == this.number_of_images) {
            entry_idx = [n_curPanel];
            entry_url = [this.images[n_curPanel].url];
        } else {
            entry_idx = [n_curPanel-1, n_curPanel];
            entry_url = [this.images[n_curPanel-1].url, this.images[n_curPanel].url];
        }

        var reloadinfo = await this.getReloadInfo(entry_idx, entry_url);
        for (var idx = 0; idx < reloadinfo.length; idx++) {
            this.images[entry_idx[idx]].path = reloadinfo[idx];
        }
        this.drawPanel();
    };

    preloader() {
        var len = this.iframe.contentDocument.getElementById('preloadInput').value;
        this.preloadImage(parseInt(len));
    }

    async preloadImage(length) {
        const preloadContainer = $('#preload', this.iframe_jq.contents());
        const currentPanel = this.curPanel;

        // 이미지 업데이트 호출 및 완료 후 처리
        await this.updateImgsAndCallAsync(currentPanel - 2, currentPanel + length + 1);

        // 현재 preloadContainer 내의 img 요소 선택
        let imgElements = preloadContainer.find('img');

        // 필요한 이미지를 미리 로드하고 src만 업데이트
        for (let idx = 0; idx < length; idx++) {
            const panelIndex = currentPanel + idx;

            // 이미지가 존재하는 경우에만 로드
            if (panelIndex < this.number_of_images) {
                const imagePath = this.images[panelIndex].path;

                if (idx < imgElements.length) {
                    // 이미 img 요소가 있으면 src만 변경
                    $(imgElements[idx], this.iframe_jq.contents()).attr('src', imagePath);
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

    // ============== Paging functions ==============
    goPanel() {
        const target = parseInt(prompt('target page'), 10);

        // target이 NaN이 아니고, 지정된 범위 내에 있을 때만 패널을 변경
        if (Number.isInteger(target) && target >= 0 && target <= this.number_of_images) {
            this.panelChange(target);
        }
    };

    pageChanged() {
        // `prevPanel`과 `nextPanel`을 조건에 따라 enable/disable
        this.drawPanel();
        this.curPanel == 1 ? this.disable($('#prevPanel', this.iframe_jq.contents())) : this.enable($('#prevPanel', this.iframe_jq.contents()));
        this.curPanel == this.number_of_images ? this.disable($('#nextPanel', this.iframe_jq.contents())) : this.enable($('#nextPanel', this.iframe_jq.contents()));
    };

    toggleTimer () {
        var intervalSeconds = parseFloat(this.iframe.contentDocument.getElementById('pageTimer').value);
        if (intervalSeconds < 1 || isNaN(intervalSeconds)) {
            return;
        }

        this.timerflag = !this.timerflag;
        var pagerButton = this.iframe.contentDocument.getElementById('autoPager');

        if (this.timerflag) {
            pagerButton.style.color = 'white';
            this.timerInterval = setInterval(()=>this.nextPanel(), intervalSeconds * 1000);
        } else {
            pagerButton.style = '';
            clearInterval(this.timerInterval);
        }
    };

    selectorChanged() {
        var selector = $('#single-page-select', this.iframe_jq.contents());

        var selectedValue = selector.val();
        this.curPanel = Number(selectedValue);
        this.pageChanged();
        selector.trigger('blur');
    };

    panelChange(target) {
        if (target === this.curPanel) return; // Prevent unnecessary updates

        // Clear any pending image updates
        if (this._panelChangeTimeout) {
            clearTimeout(this._panelChangeTimeout);
        }

        this.curPanel = target;
        $('#single-page-select', this.iframe_jq.contents()).prop('selectedIndex', target - 1);

        // Use a small timeout to ensure UI updates first
        this._panelChangeTimeout = setTimeout(() => {
            this.pageChanged();
        }, 10);
    };

    prevPanel() {
        const currentPanel = this.curPanel;

        if (currentPanel <= 1) return;

        if (this.is_single_displayed) {
            this.panelChange(currentPanel - 1);
        } else {
            const prevImage = this.images[currentPanel - 2];
            const newPanel = (currentPanel > 2 && prevImage.width <= prevImage.height)
                            ? currentPanel - 2
                            : currentPanel - 1;
            this.panelChange(newPanel);
        }

        // Fix: Use the iframe's content document for scrolling
        $(this.iframe.contentDocument.body).scrollTop(0);
        this.comicImages.scrollTop = 0;
    };

    nextPanel() {
        const currentPanel = this.curPanel;

        if (currentPanel >= this.number_of_images) return;

        if (this.is_single_displayed) {
            this.panelChange(currentPanel + 1);
        } else {
            const nextImage = this.images[currentPanel]; // images is 0-based, and currentPanel is 1-based
            const newPanel = (currentPanel + 1 < this.number_of_images && nextImage.width <= nextImage.height)
                        ? currentPanel + 2
                        : currentPanel + 1;
            this.panelChange(newPanel);
        }

        // Fix: Use the iframe's content document for scrolling
        $(this.iframe.contentDocument.body).scrollTop(0);
        this.comicImages.scrollTop = 0;
    };

    // ============== Viewer options ==============
    renderChange(){
        var docu = this.iframe.contentDocument;
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
        this.renderType = (this.renderType + 1) % renderOptions.length;
        this.renderStyle.textContent = renderOptions[this.renderType].style;
        docu.getElementById('renderingChanger').innerHTML = renderOptions[this.renderType].text;
    }

    fitOptions = {
        stretch: { className: 'fitStretch', nextButton: '#fitBoth' },
        both: { className: 'fitBoth', nextButton: '#fitHorizontal' },
        horizontal: { className: 'fitHorizontal', nextButton: '#fitVertical' },
        vertical: { className: 'fitVertical', nextButton: '#fitStretch' }
    };

    resetFit() {
        $('#comicImages', this.iframe_jq.contents()).removeClass('fitStretch fitBoth fitHorizontal fitVertical');
        $('.fitBtn', this.iframe_jq.contents()).parent().hide();
    };

    applyFit(fitType) {
        this.resetFit();
        $('#comicImages', this.iframe_jq.contents()).addClass(this.fitOptions[fitType].className);
        $(this.fitOptions[fitType].nextButton, this.iframe_jq.contents()).parent().show();
        $('body', this.iframe_jq.contents()).scrollTop(0);
    };

    setSpread(num) {
        if (this.set_spread == num) return

        this.set_spread = num;
        const isSinglePage = this.set_spread === 1;

        $('#singlePage', this.iframe_jq.contents()).toggle(isSinglePage);
        $('#fullSpread', this.iframe_jq.contents()).toggle(!isSinglePage);
        this.drawPanel();
    }

    setSpreadClass(num) {
        if (this.class_spread == num) return
        $('body', this.iframe_jq.contents()).removeClass('spread1 spread2');
        $('body', this.iframe_jq.contents()).addClass('spread' + num);
        this.class_spread = num;
    }

    // 사용 예시
    fitStretch = () => this.applyFit('stretch');
    fitBoth = () => this.applyFit('both');
    fitHorizontal = () => this.applyFit('horizontal');
    fitVertical = () => this.applyFit('vertical');


    //  ============== full screen functions ==============
    fullscreen() {
        var elem = this.comicImages;
        if (!document.fullscreenElement) {
            elem.requestFullscreen?.() || elem.msRequestFullscreen?.() || elem.mozRequestFullScreen?.() || elem.webkitRequestFullscreen?.();
        } else {
            document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.() || document.msExitFullscreen?.();
        }
    }

    handleFullscreenChange () {
        var fullscreenButton = this.iframe.contentDocument.getElementById('fullscreen');
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            // Fullscreen mode is active
            fullscreenButton.style.display = 'block';
            this.saveConfig('is_fullscreen', true);
        } else {
            // Fullscreen mode is inactive
            fullscreenButton.style.display = 'none';
            this.saveConfig('is_fullscreen', false);
        }
    }

    addFullscreenHandler(docu) {
        // Full screen handler
        docu.addEventListener('fullscreenchange', (() => this.handleFullscreenChange()));
        docu.addEventListener('webkitfullscreenchange', (() => this.handleFullscreenChange()));
        docu.addEventListener('mozfullscreenchange', (() => this.handleFullscreenChange()));
        docu.addEventListener('MSFullscreenChange', (() => this.handleFullscreenChange()));
    }

    // ============== Viewer functions ==============
    // functions called by user input
    openViewer() {
        this.iframe.style.display = 'block';
        this.iframe.focus();
        // to catch key events
        console.log("Viewer opened");
    }

    closeViewer() {
        this.iframe.style.display = 'none';
    }

    toggleViewer() {
        var is_visible = this.iframe.style.display === 'block';
        if (is_visible) {
            this.closeViewer();
        } else {
            this.openViewer();
        }
    }

    goGallery() {
        // by clicking galleryInfo, go to gallery page by brower, not iframe
        document.location = this.gallery_url;
    }

    imgDrag(e) {
        if (!this.dragState.isDragging) return;

        if (e.pageX > 0) {
        this.comicImages.scrollLeft += this.dragState.prevX - e.pageX;
        this.dragState.prevX = e.pageX;
        }
        if (e.pageY > 0) {
        this.comicImages.scrollTop += this.dragState.prevY - e.pageY;
        this.dragState.prevY = e.pageY;
        }
    };

    imgDragStart(e) {
        this.dragState.prevX = e.pageX;
        this.dragState.prevY = e.pageY;
        this.dragState.isDragging = true;
    };

    imgDragEnd() {
        this.dragState.isDragging = false;
    };

    // wheel on bottom to next image
    doWheel(e) {
        const prevScrollTop = this.comicImages.scrollTop;
        this.comicImages.scrollTop += e.deltaY;

        requestAnimationFrame(() => {
        if (this.comicImages.scrollTop === prevScrollTop) {
            e.deltaY > 0 ? this.nextPanel() : this.prevPanel();
        }
        });
    };

    setGlobalHotkey(key, callback) {
        // Add global hotkey listener to root document
        document.addEventListener('keydown', (e) => {
            if (e.key.toLowerCase() === key.toLowerCase()) {
                e.preventDefault(); // Prevent default behavior of the key
                callback(e); // Call the provided callback function
            }
        });
    }

    doHotkey(e) {
        switch (e.key.toLowerCase()) {
        case 'arrowleft':
        case 'h':
            this.prevEpisode();
            break;
        case 'arrowright':
        case 'l':
            this.nextEpisode();
            break;
        case 'j':
        case 'arrowdown':
            this.nextPanel();
            break;
        case 'k':
        case 'arrowup':
            this.prevPanel();
            break;
        case 'b':
            this.fitBoth();
            break;
        case 'v':
            this.fitVertical();
            break;
        case 'h':
            this.fitHorizontal();
            break;
        case 'f':
            this.setSpread(2);
            break;
        case 's':
            this.setSpread(1);
            break;
        case 'enter':
            this.toggleViewer();
            break;
        case ' ':
            this.fullscreen();
            break;
        case 't':
            this.toggleTimer();
            break;
        case 'r':
            this.reloadImg();
            break;
        case 'p':
            this.preloader();
            break;
        }
    };

    // ==========  Update function ==========
    checkUpdate() {
        var github_api = "https://api.github.com";
        var repo_path = "/repos/skygarlics/exhviewer";
        // version_now
        var p_version = GM_info.script.version;
        this.simpleRequestAsync(github_api + repo_path + '/releases/latest')
        .then((response) => {
            resp_json = JSON.parse(response.responseText);
            var n_version = parseInt(resp_json["tag_name"]);
            var url = resp_json["assets"][0]["browser_download_url"];
            if ((p_version < n_version) && confirm("새 버전 : " + n_version + "\n업데이트 하시겠습니까?")) {
                alert("설치 후 새로고침하면 새 버전이 적용됩니다.");
                this.openInNewTab(url);
            }
        });
    }

    // ============== Utility functions ==============
    openInNewTab(url) {
        var win = window.open(url, '_blank');
        win.focus();
    }

    // code from koreapyj/dcinside_lite
    xmlhttpRequest(details) {
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
        try {
            xmlhttp.send((typeof (details.data) !== 'undefined') ? details.data : null);
        }
        catch (e) {
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

    simpleRequestAsync(url, method = 'GET', headers = {}, data = null) {
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
            this.xmlhttpRequest(details);
        });
    };

    parseHTML(response) {
        var doc = document.implementation.createHTMLDocument('temp');
        doc.documentElement.innerHTML = response.responseText;
        return doc;
    };

    // ============== style ==============
    viewer_style = `
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
        
    #centerer {
        display: flex;
        height: 100%;
        width: 100%;
        align-items: center;
        justify-content: center;
    }

    /* fitStretch*/
    .fitStretch img {
        display: inline-block;
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

    /* fitHorizontal styles */
    .fitHorizontal img {
        display: inline-block;
        vertical-align: middle;
        max-width: 100%;
    }
    .spread2 .fitHorizontal img {
        max-height: none;
        max-width: 50%;
    }

    /* fitVertical styles */
    .fitVertical img {
        display: inline-block;
        vertical-align: middle;
        max-height: 100%;
    }
    .spread2 .fitVertical img {
        max-width: none;
        max-height: 100%;
    }

    .spread2 img.lt_img {
        object-position: right center;
    }
    .spread2 img.rt_img {
        object-position: left center;
    }

    .spread2 img{
        max-width: fit-content;
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
    #pageChanger {
        display: inline;
    }
    #fullscreen {
        display: none;
    }
    .input-medium {
        margin: 15px 15px 15px 3px;
        height: 20px;
        width: 58px;
    }
    #preloadInput {
        color: black;
        margin: 0px 10px;
        width: 35px;
        height: 17px;
    }

    #pageTimer,
    #single-page-select {
        margin-left: 0.5rem;
        height: 2rem;
        width: 3rem;
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

    #interfaceNav {
        padding: 0.2rem;
    }

    #interfaceNav .navbar-nav .nav-item:not(:first-child)  {
        border-left: 1px solid #4b4b4b; /* 원하는 색상으로 변경 가능 */
        padding-left: 0.5rem;
        margin-left: 0.5rem;
    }
    `

    fullscreen_style = `
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

    .fitBoth:-webkit-full-screen img {max-height: 100% !important; max-width: 100% !important;}
    .fitBoth:-moz-full-screen img {max-height: 100% !important; max-width: 100% !important;}
    .fitBoth:-ms-fullscreen img {max-height: 100% !important; max-width: 100% !important;}
    .fitBoth:fullscreen img {max-height: 100% !important; max-width: 100% !important;}
    `

    // ============== HTML ==============
    navbarHTML = `
    <nav id="interfaceNav" class="navbar navbar-dark bg-dark navbar-expand-lg">
    <div class="container-fluid">
        <a class="navbar-brand" id="galleryInfo">Gallery</a>
        <button id="navbar-button" class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#collapseNavbar">
        <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse d-flex justify-content-center" id="collapseNavbar">
        <ul id="funcs" class="navbar-nav text-end">
            <li class="nav-item">
            <a class="nav-link" title="Left arrow or j" id="nextPanel">
                <i class="bi bi-chevron-left"></i> Next
            </a>
            </li>
            <li class="nav-item">
            <a class="nav-link" title="Right arrow or k" id="prevPanel">
                <i class="bi bi-chevron-right"></i> Prev
            </a>
            </li>
            <li class="nav-item">
            <div class="d-flex align-items-center">
                <a id="autoPager" title="t">▶Auto</a>
                <input id="pageTimer" class="form-control-sm" type="text" value="10">
            </div>
            </li>
            <li class="nav-item">
            <div class="d-flex align-items-center">
                <a id="pageChanger">#</a>
                <select class="form-select-sm" id="single-page-select"></select>
            </div>
            </li>
            <li class="nav-item">
            <a class="nav-link" id="fullscreener" title="Enter or Space">
                <i class="bi bi-arrows-fullscreen"></i>
            </a>
            </li>
            <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownOptions" role=-"button" data-bs-toggle="dropdown" aria-expanded="false">
                Options<span class="caret"></span>
            </a>
            <ul class="dropdown-menu dropdown-menu-dark aria-labelledby="navbarDropdownOptions">
                <li>
                <a class="dropdown-item" title="r" id="reload">
                    <span>&#10227;</span> Reload
                </a>
                </li>
                <li>
                <a class="dropdown-item fitBtn" title="b" id="fitStretch">
                    <span>□</span> Fit Stretch
                </a>
                </li>
                <li>
                <a class="dropdown-item fitBtn" title="b" id="fitBoth">
                    <span>╋</span> Fit Both
                </a>
                </li>
                <li>
                <a class="dropdown-item fitBtn" title="v" id="fitVertical">
                    <span>┃</span> Fit Vertical
                </a>
                </li>
                <li>
                <a class="dropdown-item fitBtn" title="h" id="fitHorizontal">
                    <span>━</span> Fit Horizontal
                </a>
                </li>
                <li>
                <a class="dropdown-item" title="f" id="fullSpread">
                    <span>🕮</span> Full Spread
                </a>
                </li>
                <li>
                <a class="dropdown-item" title="s" id="singlePage">
                    <span>🗍</span> Single Page
                </a>
                </li>
                <li>
                <a class="dropdown-item" title="rendering" id="renderingChanger">
                    <span>🖽</span> Rendering
                </a>
                </li>
                <li>
                <a class="dropdown-item" title="p" id="preloader">
                    Preload<input id="preloadInput" type="text" value="50">
                </a>
                </li>
            </ul>
            </li>
            <li class="nav-item">
            <a class="nav-link" title="Close viewer" id="viewerCloser">
                <i class="bi bi-x-lg"></i>
            </a>
            </li>
        </ul>
        </div>
    </div>
    </nav>
    `

    imgFrameHTML = `
    <div id="comicImages" class="d-flex align-items-center justify-content-center" tabindex="1">
        <a id="fullscreen" title="Enter or Space">⛶</a>
        <a id="leftBtn" class="imageBtn"></a>
        <a id="rightBtn" class="imageBtn"></a>
        <div id="centerer">
        </div>
    </div>
    <div id="preload"></div>
    `
}
// ============== Exh global ==============
var exhaust;
var API_URL = null;
var GID_TOKEN = null;
var host = document.location.host;
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
        const response = await exhaust.simpleRequestAsync(API_URL, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(data));

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
    const response = await exhaust.simpleRequestAsync(API_URL, 'POST', {}, JSON.stringify(data));
    return response;
};


var extractImageData = async function (url, idx) {
    const response = await exhaust.simpleRequestAsync(url);  // 비동기 요청 대기
    const doc = exhaust.parseHTML(response);

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
        var response = await exhaust.simpleRequestAsync(url);
        var doc = exhaust.parseHTML(response);
        const loadFailAttr = doc.getElementById("loadfail").getAttribute("onclick");
        const nlMatch = loadFailAttr.match(/nl\('(.*)'\)/);
        if (!nlMatch) throw new Error("NL value not found");
        
        var nl =  nlMatch[1];
        url = url.replace(/\?.*/, '') + '?nl=' + nl;
        response = await exhaust.simpleRequestAsync(url);
        doc = exhaust.parseHTML(response);
        const imgSrc = doc.getElementById('img').src;
        ret.push(imgSrc);
    }
    return ret;
}

var make_gallery_url = function(gid, token) {
    return 'https://' + host + '/g/' + gid + '/' + token;
}

var enable_viewer = function () {
    var iframe = document.querySelector('iframe');
    iframe.style.display = 'block';
}

var init = async function () {
    var url = document.location.href;
    var curPanel = Number(url.substring(url.lastIndexOf('-') + 1));
    
    exhaust = new EXHaustViewer(curPanel);
    exhaust.getReloadInfo = getReloadInfo;
    exhaust.extractImageData = extractImageData;

    exhaust.clearHotkeys();

    // add button to iframe visible
    exhaust.addShowbutton('.sn')
    exhaust.setGlobalHotkey('Enter', () => {
        exhaust.toggleViewer();
    })

    exhaust.openViewer();
    getToken()
    .then(token => {
        exhaust.gallery_url = make_gallery_url(token.gid, token.token);
        var title = document.querySelector('h1').textContent;
        exhaust.setGalleryTitle(null, title);
        return getGdataAsync(token.gid, token.token)
    })
    .then((response) => {
        // make image list
        var gmetadata = JSON.parse(response.responseText).gmetadata[0];
        exhaust.number_of_images = Number(gmetadata.filecount);
        var gallery_page_url = make_gallery_url(gmetadata.gid, gmetadata.token) + '/?p=';

        var pushImgs = function (doc) {
            var imgs = doc.querySelectorAll("#gdt > a");
            for (var idx = 0; idx < imgs.length; idx++) {
                var regex_temp = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
                var img = imgs[idx];
                var url_temp = img.href;
                var match_temp = regex_temp.exec(url_temp);
                exhaust.setImgData(match_temp[3] - 1,{
                        page: match_temp[3],
                        url: url_temp,  // url is page that contains image, not path of image
                        token: match_temp[1]
                    }
                );
            }
        };

        var gallery_page_len;
        var current_gallery_page;

        exhaust.simpleRequestAsync(gallery_page_url + 0)
        .then(exhaust.parseHTML)
        .then((doc) => {
            // pages td count in table.ptt
            var table = doc.querySelector('table.ptt');
            var cnt = doc.querySelectorAll("#gdt > a").length;
            if (table.querySelectorAll('td').length > 3) { // if there are more than 3 buttons, there are more than 1 page
                // determine image per page
                gallery_page_len = Math.ceil(exhaust.number_of_images / cnt);
            } else {
                gallery_page_len = 1;
            }

            current_gallery_page = Number(table.querySelector('.ptds').textContent);

            // push requestes page1 images
            pushImgs(doc);
        })
        .then(() => {
            // push current page first
            if (current_gallery_page !== 1) {
                return exhaust.simpleRequestAsync(gallery_page_url + (current_gallery_page - 1))
                    .then(exhaust.parseHTML)
                    .then(pushImgs);
            }
        })
        .then(()=>{
            exhaust.finally()
            // load rest of galleries
            for (var i = 1; i < gallery_page_len+1; i++) {
                if (i+1 !== current_gallery_page) {
                    exhaust.simpleRequestAsync(gallery_page_url + i)
                    .then(exhaust.parseHTML)
                    .then(pushImgs);
                }
            }
        });
    })
    .catch(error => console.error("Error initializing viewer:", error));
};

init();
})();