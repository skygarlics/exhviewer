// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       250308
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

// ============== Viewer ==============

class EXHaustViewer {
    // Viewer elements
    iframe = null;
    iframe_jq = null;
    comicImages;

    update_check = false;
    PanelListenerAdded = false;
    spread = 1;
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
    curPanel; // current panel number (1-indexed, always has to be integer)

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
        this.iframe.onload = () => {
            this.init()
        };
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
        this.fitVertical();

        var docElm = this.iframe.contentDocument.documentElement;
        if (!docElm.requestFullscreen && !docElm.mozRequestFullScreen && !docElm.webkitRequestFullScreen && !docElm.msRequestFullscreen) {
            $('#fullscreen', this.iframe_jq.contents()).parent().hide();
        }

        $('#single-page-select', this.iframe_jq.contents()).prop('selectedIndex', this.curPanel - 1);
        $('#two-page-select', this.iframe_jq.contents()).prop('selectedIndex', this.curPanel - 1);
    }

    finally = this.pageChanged;

    // ==============  ==============
    // functions can be overridden if nenecessary
    getReloadInfo = async (entry_idx, entry_url) => {
        // in default, it just returns original path
        return images[entry_idx].path;
    };

    extractImageData = async (url, idx) => {
        // TODO : ganerally usable function
        error = new Error("Not implemented");
        throw error;
    }

    // ============== setup functions ==============
    // Viewer iframe
    async addIframe() {
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

        //iframe.style.display = 'none';

        // inje iframe html
        iframe.srcdoc = '<!DOCTYPE html><html>' +
            '<head>' +
                '<script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>' +
                '<script src="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/js/bootstrap.min.js"></script>' +
                '<link type="text/css" rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">' +
                // custom css
                '<style>' +
                    this.viewer_style +
                    this.fullscreen_style +
                '</style>' +
            '</head>' +
            '<body>' +
                this.navbarHTML +
                this.imgFrameHTML +
            '</body></html>';
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
        // add navbar
        var body = this.iframe.contentDocument.body;
        body.innerHTML += code;
    }

    createPageDropdown() {
        // clear previous dropdown
        $('#single-page-select', this.iframe_jq.contents()).empty();
        $('#two-page-select', this.iframe_jq.contents()).empty();

        for (var i = 1; i <= this.number_of_images; i++) {
            var option = $('<option>', {
                html: '' + i,
                value: i
            });
            $('#single-page-select', this.iframe_jq.contents()).append(option);
        }
        for (var i = 1; i <= this.number_of_images; i++) {
            var option = $('<option>', {
                html: '' + i,
                value: i
            });
            $('#two-page-select', this.iframe_jq.contents()).append(option);
        }
    }

    setGalleryTitle(text, title) {
        var gallery_info = this.iframe.contentDocument.getElementById('galleryInfo');

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
        docu.getElementById('single-page-select').addEventListener('change', ()=>this.selectorChanged(1));
        docu.getElementById('two-page-select').addEventListener('change', ()=>this.selectorChanged(2));
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
        const comicImagesContainer = $('#comicImages', this.iframe.contentDocument);
        const currentPanel = this.curPanel;
        const totalImages = this.number_of_images;
        const singleSpread = this.spread === 1;
    
        $('body', this.iframe_jq.contents()).attr('class', singleSpread ? 'spread1' : 'spread2');
    
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
                this.updateImageWithFadeIn($(imgElements[1], this.iframe_jq.contents()), previousImage.path);
                this.updateImageWithFadeIn($(imgElements[0]), currentImage.path);
                this.is_single_displayed = false;
                this.preloadImage(3);
            } else {
                this.updateImageWithFadeIn($(imgElements[0], this.iframe_jq.contents()), previousImage.path);
                $(imgElements[1], this.iframe_jq.contents()).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
                this.is_single_displayed = true;
                this.preloadImage(2);
            }
        } else if (currentPanel <= totalImages) {
            this.updateImageWithFadeIn($(imgElements[0], this.iframe_jq.contents()), this.images[currentPanel - 1].path);
            this.is_single_displayed = true;
            $(imgElements[1], this.iframe_jq.contents()).remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
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
            img.path = imgData.path;
            img.width = imgData.width;
            img.height = imgData.height;
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
        var pagerButton = this.iframe.contentDocument.getElementById('autoPager').getElementsByTagName('span')[0];
      
        if (this.timerflag) {
            pagerButton.classList.add('icon_white');
            this.timerInterval = setInterval(()=>this.nextPanel(), intervalSeconds * 1000);
        } else {
            pagerButton.classList.remove('icon_white');
            clearInterval(this.timerInterval);
        }
    };

    selectorChanged(selector_num) {
        var selector;
        if (selector_num === 1) {
            selector = $('#single-page-select', this.iframe_jq.contents());
        } else if (selector_num === 2) {
            selector = $('#two-page-select', this.iframe_jq.contents());
        } else {
            console.error("Invalid selector value:", selector_num);
        }
    
        var selectedValue = selector.val();
        this.curPanel = Number(selectedValue);
        this.pageChanged();
        selector.trigger('blur');
    };

    panelChange(target) {
        if (this.spread == 1) {
            $('#single-page-select', this.iframe_jq.contents()).prop('selectedIndex', target - 1);
            this.selectorChanged(1);
        } else {
            $('#two-page-select', this.iframe_jq.contents()).prop('selectedIndex', target - 1);
            this.selectorChanged(2);
        }
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
    
        $('body').scrollTop(0);
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
    
        $('body', this.iframe_jq.contents()).scrollTop(0);
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
        $('#comicImages', this.iframe_jq.contents()).removeClass();
        $('.fitBtn', this.iframe_jq.contents()).parent().hide();
    };
    
    applyFit(fitType) {
        this.resetFit();
        $('#comicImages', this.iframe_jq.contents()).addClass(this.fitOptions[fitType].className);
        $(this.fitOptions[fitType].nextButton, this.iframe_jq.contents()).parent().show();
        $('body', this.iframe_jq.contents()).scrollTop(0);
    };

    setSpread(num) {
        if (this.spread == num) return
    
        $('body', this.iframe_jq.contents()).removeClass('spread' + this.spread);
        this.spread = num;
        $('body', this.iframe_jq.contents()).addClass('spread' + this.spread);
    
        const isSinglePage = this.spread === 1;
    
        $('#singlePage', this.iframe_jq.contents()).toggle(isSinglePage);
        $('#single-page-select', this.iframe_jq.contents()).toggle(isSinglePage);
    
        $('#fullSpread', this.iframe_jq.contents()).toggle(!isSinglePage);
        $('#two-page-select', this.iframe_jq.contents()).toggle(!isSinglePage);
    
        this.drawPanel();
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
        } else {
            // Fullscreen mode is inactive
            fullscreenButton.style.display = 'none';
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
    closeViewer() {
        this.iframe.style.display = 'none';
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

    doHotkey(e) {
        switch (e.key.toLowerCase()) {
        case 'j':
        case 'arrowleft':
            this.nextPanel();
            break;
        case 'k':
        case 'arrowright':
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
    #fullscreen {
        display: none;
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
    `

    // ============== HTML ==============
    navbarHTML = `
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
                <span>#</span>
              </a>
              <select class="input-medium" id="single-page-select"></select>
              <select class="input-medium" style="display: none;" id="two-page-select"></select>
            </li>
            <li>
                <a id="fullscreener" title="Enter or Space">
                    <span>⛶</span>
                </a>
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
            <li>
              <a title="Close viewer" id="viewerCloser">
                <span>❌</span>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </nav>
    `

    imgFrameHTML = `
    <div id="comicImages" class="fitVertical" tabindex="1">
        <a id="fullscreen" title="Enter or Space">⛶</a>
        <a id="leftBtn" class="imageBtn"></a>
        <a id="rightBtn" class="imageBtn"></a>
        <div class="centerer"></div>
    </div>
    <div id="preload"></div>
    `
}

// ============== Exh global ==============
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
    var btn = document.createElement('a');
    btn.id = 'enableViewer';
    btn.innerHTML = 'Viewer';
    btn.onclick = enable_viewer;

    var original_btn_div = document.querySelector('.sn');
    original_btn_div.appendChild(btn);

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
