// ==UserScript==
// @name          exh_viewer
// @namespace     skgrlcs
// @version       250427
// @author        aksmf
// @description   image viewer for exhentai
// @include       https://exhentai.org/s/*
// @include       https://exhentai.org/mpv/*
// @include       https://e-hentai.org/s/*
// @include       https://e-hentai.org/mpv/*
// @grant         GM_getValue
// @grant         GM_setValue
// @grant         GM_deleteValue
// @grant         GM_listValues
// @grant         GM_getResourceText
// @grant		  GM.getResourceUrl
// ==/UserScript==

class EXHaustViewer {
    "use strict";
    // Viewer elements
    iframe = null;
    get iframe_doc() {
        return this.iframe?.contentDocument || null;
    }
    comicImages;
    thumbnailContainer;
    
    update_check = false;
    PanelListenerAdded = false;
    set_spread = 0;
    class_spread = 1;
    is_single_displayed = true;
    timerflag = false;
    timerInterval = null;
    renderType = -1; // make sure renderType start from 0
    fitType = -1;
    
    dragState = {
        isDragging: false,
        prevX: 0,
        prevY: 0
    };
    
    images = {}; // image datas. 0-indexed. {idx: {url, width, height, path, nl, updated}}
    thumbnails = {}; // thumbnail datas. {idx: element} // each element has data-idx attribute.
    
    curPanel = 1; // current panel number (1-indexed, always has to be integer)
    
    #number_of_images;
    get number_of_images() {
        return this.#number_of_images;
    }
    
    set number_of_images(value) {
        if (value < 1) {
            console.error("Invalid number of images:", value);
            return;
        }
        this.#number_of_images = value;
        this.createPageDropdown();
    }
    
    set_number_of_images(value, make_thumb) {
        this.number_of_images = value;
        if (make_thumb) {
            this.batchReplaceThumbnails(
                (function* () {for (let i = 1; i < value+1; i++) { yield i }})(),
                'empty_thumb'
            );
        }
    }
    
    #gallery_url;
    get gallery_url() {
        return this.#gallery_url;
    }
    set gallery_url(value) {
        this.#gallery_url = value;
    
        var gallery_info = this.iframe_doc.getElementById('galleryInfo');
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
        this.body = this.iframe_doc.body;
        this.renderStyle = this.addRenderStyle(this.iframe_doc);
        this.comicImages = this.iframe_doc.getElementById('comicImages');
        this.thumbnailContainer = this.iframe_doc.getElementById('thumb_container');
        // prevent dropdown from close
    
        let dropdowns = this.iframe_doc.querySelectorAll('.dropdown-menu');
        dropdowns.forEach((dropdown) => {
            dropdown.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent click event from propagating to the document
            })
        });
    
        this.iframe_doc.body.setAttribute('class', 'spread1');
        //this.addStyle('div#i1 {display:none;} p.ip {display:none;}');
    
        this.addEventListeners(this.iframe_doc);
        this.addFullscreenHandler(this.iframe_doc);
    
        this.renderChange();
        this.changeFit();
        this.iframe_doc.getElementById('single-page-select').value = this.curPanel - 1;
    }
    
    finally = this.pageChanged;
    
    // ==============  ==============
    // these functions can be overridden by nenecessary
    
    /**
     * Override to get current page by current image on original page
     * @returns {number} current page that Original page is showing
     *  */
    getPageFromOriginal = null;
    
    prevEpisode() {
        console.log("override required: prevEpisode()");
        return;
    }
    
    nextEpisode() {
        console.log("override required: nextEpisode()");
        return;
    }
    
    getReloadInfo = async (nl_url, path) => {
        return { path: path, nl_url: nl_url };
    };
    
    extractImageData = async (url, idx) => {
        // in default, it just return nothing
        return { path: url };
    }
    
    // ============== setup functions ==============
    saveConfig(key, value) {
        if (!GM_getValue) {
            console.error("GM_getValue is not defined. Cannot save config.");
            return false;
        }
        return GM_setValue(key, value);
    }
    
    loadConfig(key) {
        if (!GM_getValue) {
            console.error("GM_getValue is not defined. Cannot load config.");
            return null;
        }
        return GM_getValue(key);
    }
    
    addShowbutton(selector, elem_type, inner_html) {
        var elem_ = elem_type ? elem_type : 'a';
        var inner = inner_html ? inner_html : '<div style="font-size: 2em; user-select: none">🕮</div>';
        var target = document.querySelector(selector);
    
        var btn = document.createElement(elem_);
        btn.id = 'enableViewer';
        btn.innerHTML = inner;
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
    
        iframe.srcdoc = `<!DOCTYPE html><html>
            <head>
                <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
                <link href=" https://cdn.jsdelivr.net/npm/bootstrap@5.3.5/dist/css/bootstrap.min.css" rel="stylesheet">
                <script src=" https://cdn.jsdelivr.net/npm/bootstrap@5.3.5/dist/js/bootstrap.bundle.min.js "></script>
                <style>
                    ${this.viewer_style}
                    ${this.fullscreen_style}
                    ${this.makeDynamicStyles()}
                </style>
            </head>
            <body>
                ${this.navbarHTML}
                ${this.imgFrameHTML}
            </body></html>`;
        document.body.appendChild(iframe);
        this.iframe = iframe;
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
        var body = this.iframe_doc.body;
        body.innerHTML += code;
    }
    
    createPageDropdown() {
        // clear previous dropdown
        const dropdown = this.iframe_doc.getElementById('single-page-select');
        dropdown.innerHTML = ''; // Clear previous options
    
        const fragment = this.iframe_doc.createDocumentFragment();
    
        for (var i = 1; i <= this.number_of_images; i++) {
            const option = this.iframe_doc.createElement('option');
            option.value = i;
            option.textContent = i;
            option.selected = i === this.curPanel; // Select the current panel
            fragment.appendChild(option);
        }
        dropdown.appendChild(fragment);
    }
    
    setGalleryTitle(text, title) {
        var gallery_info = this.iframe_doc.getElementById('galleryInfo');
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
        docu.addEventListener('keydown', (e) => this.interalKeyHandler(e));
        docu.getElementById('centerer').addEventListener('wheel', (e) => {
            this.doWheel(e)
            // ensure wheel don't propagae to parent
            e.stopPropagation();
            e.preventDefault();
        }, { passive: false });
        docu.getElementById('prevPanel').addEventListener('click', ()=>this.prevPanel());
        docu.getElementById('nextPanel').addEventListener('click', ()=>this.nextPanel());
        docu.getElementById('fitChanger').addEventListener('click', () => this.changeFit());
        docu.getElementById('fullscreener').addEventListener('click', ()=>this.toggleFullscreen());
        docu.getElementById('spreadChanger').addEventListener('click', () => this.toggleSpread());
        docu.getElementById('renderingChanger').addEventListener('click', () => this.renderChange());
        docu.getElementById('reload').addEventListener('click', ()=>this.reloadCurrentImg());
        docu.getElementById('preloader').addEventListener('click', ()=>this.preloader());
        docu.getElementById('autoPager').addEventListener('click', () => this.toggleTimer());
        docu.getElementById('pageChanger').addEventListener('click', () => this.goPanel());
        docu.getElementById('single-page-select').addEventListener('change', ()=>this.selectorChanged());
        
        docu.getElementById('comicImages').addEventListener('mousedown', (e) => this.imgDragStart(e));
        docu.getElementById('comicImages').addEventListener('mousemove', (e) => this.imgDrag(e));
        docu.getElementById('comicImages').addEventListener('mouseup', () => this.imgDragEnd());
        docu.getElementById('comicImages').addEventListener('touchstart', (e) => this.touchStart(e), {passive:false});
        docu.getElementById('comicImages').addEventListener('touchmove', (e) => this.touchDrag(e));
        docu.getElementById('comicImages').addEventListener('touchend', () => this.imgDragEnd());
    
        docu.getElementById('viewerCloser').addEventListener('click', () => this.closeViewer());
        docu.getElementById('galleryInfo').addEventListener('click', () => this.goGallery());
    
        docu.getElementById('fullscreen').addEventListener('click', ()=>this.toggleFullscreen());
        
        docu.getElementById('thumbnailModal').addEventListener('show.bs.modal', () => {
            setTimeout(() => {
                // Move the backdrop to the comicImages container; for fullscreen
                const backdrop = docu.querySelector('.modal-backdrop');
                if (backdrop) {
                    this.comicImages.appendChild(backdrop);
                }
            }, 0);
            
            setTimeout(() => {
                const curr = this.curPanel;
                const target_thumb = this.thumbnailContainer.querySelector(`#thumbnail_${curr - 1}`);
                if (target_thumb) {
                    target_thumb.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 170);
        });
        // docu.getElementById('addthumb').addEventListener('click', () => {
        //     var thumb_count = this.thumbnailContainer.childElementCount;
        //     var thumb_elem = docu.createElement('div');
        //     thumb_elem.textContent = 'Thumb ' + thumb_count;
        //     this.setThumbnail(thumb_count, thumb_elem)
        // });
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
        var doc = this.iframe_doc;
        var parent = doc.head || doc.documentElement;
        var style = doc.createElement('style');
        style.type = 'text/css';
        var textNode = doc.createTextNode(css);
        style.appendChild(textNode);
        parent.appendChild(style);
    }
    
    // ============== Draw functions ==============
    drawPanel_() {
        const comicImagesContainer = this.iframe_doc.getElementById('centerer');
        const currentPanel = this.curPanel;
        const totalImages = this.number_of_images;
        const singleSpread = this.set_spread === 1;
    
        // 기존 img 요소를 가져오거나 없는 경우 새로 추가
        // let imgElements = comicImagesContainer.find('img');
        let imgElements = comicImagesContainer.querySelectorAll('img');
        const requiredImageCount = singleSpread ? 1 : 2;
    
        let count = requiredImageCount - imgElements.length;
        for (let idx = 0; idx < count; idx++) {
            const newImage = this.iframe_doc.createElement('img');
            comicImagesContainer.appendChild(newImage);
        }
        imgElements = comicImagesContainer.querySelectorAll('img'); // Update the imgElements after adding new images
    
        if (!singleSpread && currentPanel > 1 && currentPanel < totalImages) {
            const nextImage = this.images[currentPanel];
            const currentImage = this.images[currentPanel - 1];
    
            // TODO : nextPanel, prevPanel에서도 계산되는거 제거하기?
            // normally 
            var hw_ratio = currentImage.height / currentImage.width;
            if (nextImage.width <= nextImage.height && hw_ratio > 1.2) {
                // two image
                this.setSpreadClass(2);
                var rt_img = imgElements[1];
                rt_img.classList.add('rt_img');
                var lt_img = imgElements[0];
                lt_img.classList.add('lt_img');
    
                this.showImage(rt_img, currentImage, currentPanel-1, currentPanel);
                this.showImage(lt_img, nextImage, currentPanel, currentPanel);
                this.is_single_displayed = false;
                this.preloadImage(3);
            } else {
                // single image
                this.setSpreadClass(1);
                this.showImage(imgElements[0], currentImage, currentPanel-1, currentPanel);
                if (imgElements.length > 1) {
                    imgElements[0].classList.remove('lt_img');
                    imgElements[1].remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
                }
                this.is_single_displayed = true;
                this.preloadImage(2);
            }
        } else if (currentPanel <= totalImages) {
            // single image
            this.setSpreadClass(1);
            this.showImage(imgElements[0], this.images[currentPanel-1], currentPanel-1, currentPanel);
            this.is_single_displayed = true;
            if (imgElements.length > 1) {
                imgElements[0].classList.remove('lt_img');
                imgElements[1].remove(); // 두 번째 이미지가 필요하지 않을 경우 제거
            }
            this.preloadImage(2);
        }
    
        if (!this.PanelListenerAdded) {
            this.iframe_doc.getElementById('leftBtn').addEventListener('click', () => this.nextPanel());
            this.iframe_doc.getElementById('rightBtn').addEventListener('click', () => this.prevPanel());
            this.PanelListenerAdded = true;
        }
        comicImagesContainer.scrollTop = 0;;
    };
    
    drawPanel() {
        var n_curPanel = this.curPanel;
        this.updageImgsRange(n_curPanel, n_curPanel+2)
        .then(()=>this.drawPanel_());
    };
    
    showImage(imgElement, imgObj, idx, curPanel) {
        var RETRY_LIMIT = 3;
        var retry_count = 0;
    
        // check if newSrc is undefined
        if (!imgObj.path) {
            return;
        }
    
        const tempImg = new Image();
        
        tempImg.onload = () => {
            var is_cur = this.curPanel == curPanel; // check if current panel is still same
            if (!is_cur) return;
            imgElement.setAttribute('src', imgObj.path);
            imgElement.style.opacity = '1';
        };
        
        tempImg.onerror = () => {
            console.error("Img load failed:", imgObj.path);
        };
    
        // imgElement.css('opacity', '0'); // 로드 중에는 투명하게 유지
        tempImg.src = imgObj.path;
            // 이미 캐시에 있는 경우 즉시 표시
        if (tempImg.complete) {
            imgElement.setAttribute('src', imgObj.path);
            imgElement.style.opacity = '1';
        } else {
            imgElement.style.opacity = '0'; // 로드 중에는 투명하게 유지
        }
    }
    
    // ============== Thumbnail functions ==============
    createThumbnailWrapper(idx, element, callback) {
        if (element == null || element === undefined) {
            console.error("Element is null or undefined:", element);
            return;
        }
    
        const wrapper = document.createElement('div');
        wrapper.className = 'thumbnail_wrapper';
        wrapper.id = 'thumbnail_' + idx;
        if (callback) {
            wrapper.addEventListener('click', () => {
                callback(idx);
            });
        } else {
            wrapper.addEventListener('click', () => {
                this.panelChange(idx + 1);
                const close_button = this.iframe_doc.querySelector('.btn-close');
                if (close_button) {
                    close_button.click(); // Close the thumbnail modal
                }
            });
        }
    
        // if element type is string, then just set wrapper's innerHTML
        if (typeof element === 'string' || typeof element === 'number') {
            wrapper.innerHTML = element;
        } else {
            // element.setAttribute('data-idx', idx);
            wrapper.appendChild(element);
        }
        return wrapper;
    }
    
    batchReplaceThumbnails(elements, class_string, callback) {
        // empthy thumbnail
        this.thumbnailContainer.innerHTML = '';
        this.thumbnails = {};
    
        this.batchAddThumbnails(elements, class_string, callback);
    }
    
    batchAddThumbnails(elements, class_strings, callback) {
        if (!elements || typeof elements[Symbol.iterator] !== 'function') {
            console.error("elements is not iterable", elements);
            return;
        }
        const frag = this.iframe_doc.createDocumentFragment();
    
        var idx = 0;
        for (const element of elements) {
            const wrapper = this.createThumbnailWrapper(idx, element, callback);
            if (class_strings) {
                wrapper.classList.add(...class_strings.split(' '));
            }
            this.thumbnails[idx] = wrapper;
            frag.appendChild(wrapper);
            idx++;
        }
        this.thumbnailContainer.appendChild(frag);
    }
    
    setThumbnail(idx, element, class_strings, force, callback) {
        const neww = this.createThumbnailWrapper(idx, element, callback);
        if (class_strings) {
            neww.classList.add(...class_strings.split(' '));
        }
    
        const oldw = this.thumbnailContainer.querySelector('#thumbnail_' + idx);
    
        if (oldw) {
            if (!force) {
                return; // Thumbnail already exists, no need to replace
            }
            this.thumbnailContainer.replaceChild(neww, oldw);
        } else {
            this.thumbnailContainer.appendChild(neww);
        }
        this.thumbnails[idx] = neww;
    }
    
    // ============== Image loading functions ==============
    setImgData(page, imgData) {
        this.images[page] = imgData;
    };
    
    async updateImgData(img, idx, extractor, reload) {
        if (!img || !img.url) {
            console.error("Invalid image data:", img);
            return;
        }
    
        try {
            // imgData structure
            // {url: string // url of page contiang image
            //  width: number // image width, 
            //  height: number // image height, 
            //  path: string // path of image, 
            //  updated: boolean // is Data itself is updated
            //  nl: number // page url get when reload requested
            var imgData;
            if (reload) {
                imgData = await extractor(img.nl, idx)
            } else {
                imgData = await extractor(img.url, idx)
            }
    
            if (!imgData) {
                return;
            }
            
            // 이미지 경로 및 크기 정보 업데이트
            if (imgData.path) img.path = imgData.path;
            if (imgData.width) img.width = imgData.width;
            if (imgData.height) img.height = imgData.height;
            if (imgData.nl) img.nl = imgData.nl;
            img.updated = true;
    
            // check if thumbnails is empty
            const cls_list = this.thumbnails[idx]?.classList;
            if (!this.thumbnails[idx] || cls_list.contains('empty_thumb') || (reload && cls_list.contains("original_image")))  {
                var thumb_elem = this.iframe_doc.createElement('img');
                thumb_elem.src = img.path;
                this.setThumbnail(idx, thumb_elem, "original_image", true);
            }
    
        } catch (error) {
            console.error("Error updating image:", error);
            throw error;  // 오류가 발생한 경우 상위로 throw하여 처리
        }
    };
    
    async updageImgsRange(start, end) {
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
            await this.updateImgData(img, idx, this.extractImageData);
        });
    
        await Promise.all(promise_entry);
    };
    
    async reloadCurrentImg() {
        //console.log('reloadImg called');
        var n_curPanel = this.curPanel;
    
        // images[n_curPanel] = next page
        // if current page is last, entry current page only
    
        var update_entry;
        if (n_curPanel == this.number_of_images) {
            update_entry = [n_curPanel];
        } else {
            update_entry = [n_curPanel-1, n_curPanel];
        }
    
        const promise_entry = update_entry.map(async (idx) => {
            var iobj = this.images[idx];
            await this.reloadImg(iobj, idx);
        });
        await Promise.all(promise_entry);
        this.drawPanel();
    };
    
    async reloadImg(imgObj, idx) {
        await this.updateImgData(imgObj, idx, this.extractImageData, true)
    }
    
    preloader() {
        var len = this.iframe_doc.getElementById('preloadInput').value;
        this.preloadImage(parseInt(len));
    }
    
    async preloadImage(length) {
        const preloadContainer = this.iframe_doc.getElementById('preload');
        const currentPanel = this.curPanel;
    
        // 이미지 업데이트 호출 및 완료 후 처리
        await this.updageImgsRange(currentPanel - 2, currentPanel + length + 1);
    
        // 현재 preloadContainer 내의 img 요소 선택
        let imgElements = preloadContainer.querySelectorAll('img');
        let cnt = length - imgElements.length;
    
        // 부족한 경우 새 img 요소를 추가
        if (cnt > 0) {
            let fragment = this.iframe_doc.createDocumentFragment();
            for (let idx = 0; idx < cnt; idx++) {
                const newImage = this.iframe_doc.createElement('img');
                fragment.appendChild(newImage);
            }
            preloadContainer.appendChild(fragment);
            imgElements = preloadContainer.querySelectorAll('img'); // Update the imgElements after adding new images
    
        }
        // 필요한 이미지를 미리 로드하고 src만 업데이트
        for (let idx = 0; idx < length; idx++) {
            const panelIndex = currentPanel + idx;
    
            // 이미지가 존재하는 경우에만 로드
            if (panelIndex < this.number_of_images) {
                const imagePath = this.images[panelIndex].path;
                // 이미 img 요소가 있으면 src만 변경
                imgElements[idx].src = imagePath;
            }
        }
        // 불필요한 추가 노드가 있으면 제거
        if (imgElements.length > length) {
            // imgElements.slice(length).remove();
            for (let i = length; i < imgElements.length; i++) {
                imgElements[i].remove();
            }
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
    
    pageChangedHalders = [];
    pageChanged() {
        // `prevPanel`과 `nextPanel`을 조건에 따라 enable/disable
        this.drawPanel();
        this.curPanel == 1 ? this.disable(this.iframe_doc.getElementById('prevPanel')) : this.enable(this.iframe_doc.getElementById('prevPanel'));
        this.curPanel == this.number_of_images ? this.disable(this.iframe_doc.getElementById('nextPanel')) : this.enable(this.iframe_doc.getElementById('nextPanel'));
        for (const handler of this.pageChangedHalders) {
            handler(this.curPanel);
        }
    };
    addPageChangedHandler(handler) {
        if (typeof handler === 'function') {
            this.pageChangedHalders.push(handler);
            return handler;
        }
    }
    removePageChangedHandler(to_remove) {
        if (!to_remove) return false;
        const initialLength = this.pageChangedHalders.length;
        this.pageChangedHalders = this.pageChangedHalders.filter(handler => handler !== to_remove);
        return this.pageChangedHalders.length < initialLength;
    }
    clearPageChangedHandlers() {
        this.pageChangedHalders = [];
    }
    
    toggleTimer () {
        var intervalSeconds = parseFloat(this.iframe_doc.getElementById('pageTimer').value);
        if (intervalSeconds < 1 || isNaN(intervalSeconds)) {
            return;
        }
    
        this.timerflag = !this.timerflag;
        var pagerButton = this.iframe_doc.getElementById('autoPager');
    
        if (this.timerflag) {
            pagerButton.style.color = 'white';
            this.timerInterval = setInterval(()=>this.nextPanel(), intervalSeconds * 1000);
        } else {
            pagerButton.style = '';
            clearInterval(this.timerInterval);
        }
    };
    
    selectorChanged() {
        var selector = this.iframe_doc.getElementById('single-page-select');
        var selectedValue = selector.value;
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
        this.iframe_doc.getElementById('single-page-select').value = target; // Update the dropdown value
    
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
    
        this.iframe_doc.body.scrollTop = 0;
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
        this.iframe_doc.body.scrollTop = 0;
        this.comicImages.scrollTop = 0;
    };
    
    // ============== Viewer options ==============
    
    renderOptions = [
        'render_auto',
        'render_crisp',
        'render_pixelated',
    ];
    
    renderChange(){
        const centerer = this.iframe_doc.getElementById('centerer');
        this.renderType = (this.renderType + 1) % this.renderOptions.length;
        var render_class = this.renderOptions[this.renderType];
    
        centerer.classList.remove(...this.renderOptions);
        centerer.classList.add(render_class);
    }
    
    fitOptions = {
        'stretchBoth': '<i class="bi bi-arrows-move"></i> Stretch Both',
        'stretchHorizontal': '<i class="bi bi-arrows"></i> Stretch Width',
        'stretchVertical': '<i class="bi bi-arrows-vertical"></i> Stretch Height',
        'fitBoth': '<i class="bi bi-plus-lg"></i> Fit Both',
        'fitHorizontal': '<i class="bi bi-dash-lg"></i> Fit Width',
        'fitVertical': '<span>┃</span> Fit Height',
    };
    
    changeFit() {
        this.fitType = (this.fitType + 1) % Object.keys(this.fitOptions).length;
        const classes = Object.keys(this.fitOptions);
    
        const centerer = this.iframe_doc.getElementById('centerer');
        centerer.classList.remove(...classes);
        centerer.classList.add(classes[this.fitType]);
        
        const fitChanger = this.iframe_doc.getElementById('fitChanger');
        fitChanger.innerHTML = this.fitOptions[classes[this.fitType]];
    }
    
    spreads = [
        `<i class="bi bi-book-half"></i> Single Page`,
        `<i class="bi bi-book"></i> Full Spread`,
    ]
    
    toggleSpread() {
        this.setSpread(this.set_spread == 1 ? 2 : 1);
    }
    setSpread(num) {
        if (this.set_spread == num) return;
        this.set_spread = num;
        const spreadChanger = this.iframe_doc.getElementById('spreadChanger');
        spreadChanger.innerHTML = this.spreads[this.set_spread - 1];
        this.drawPanel();
    }
    /**
     * Set spread's class "Without" changing spread mode; Used to inner logic to single page view on landscape picture
     * @param {Number} num - number to set spread class. 1 or 2
     * @returns 
     */
    setSpreadClass(num) {
        if (this.class_spread == num) return;
        const body = this.iframe_doc.body;
        // Remove existing spread classes
        body.classList.remove('spread1', 'spread2');
        body.classList.add('spread' + num);
        this.class_spread = num;
    }
    
    //  ============== full screen functions ==============
    
    requestFullscreen() {
        if (document.fullscreenElement) return;
        var elem = this.comicImages;
        elem.requestFullscreen?.() || elem.msRequestFullscreen?.() || elem.mozRequestFullScreen?.() || elem.webkitRequestFullscreen?.();
    }
    
    exitFullscreen() {
        if (!document.fullscreenElement) return;
        document.exitFullscreen?.() || document.webkitExitFullscreen?.() || document.mozCancelFullScreen?.() || document.msExitFullscreen?.();
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            this.requestFullscreen()
        } else {
            this.exitFullscreen()
        }
    }
    
    handleFullscreenChange () {
        const toprt = this.iframe_doc.getElementById('fullBtnTopRt');
        if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
            // Fullscreen mode is active
            toprt.style.display = 'block';
            this.saveConfig('is_fullscreen', true);
        } else {
            // Fullscreen mode is inactive
            toprt.style.display = 'None';
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
        var original_page = this.getPageFromOriginal ? this.getPageFromOriginal() : null;
        if (original_page) {
            this.panelChange(original_page);
        }
        this.iframe.style.display = 'block';
        this.iframe.focus();
        // to catch key events
        console.log("Viewer opened");
    }
    
    closeViewer() {
        this.iframe.style.display = 'none';
        this.exitFullscreen();
    };
    
    toggleViewer() {
        var is_visible = this.iframe.style.display === 'block';
        if (is_visible) {
            this.closeViewer();
        } else {
            this.openViewer();
        }
    };
    
    goGallery() {
        // by clicking galleryInfo, go to gallery page by brower, not iframe
        document.location = this.gallery_url;
    };
    
    imgDrag(e) {
        if (!this.dragState.isDragging) return;
    
        if (e.pageX > 0) {
            const deltaX = this.dragState.prevX - e.pageX;
            this.comicImages.scrollLeft += deltaX;
            this.dragState.prevX = e.pageX;
        }
        if (e.pageY > 0) {
            const deltaY = this.dragState.prevY - e.pageY;
            this.comicImages.scrollTop += deltaY;
            this.dragState.prevY = e.pageY;
        }
        e.preventDefault();
    };
    
    touchDrag(e) {
        if (!this.dragState.isDragging || e.touches.length !== 1) return; // multi touch
    
        const touch = e.touches[0];
        if (touch.pageX > 0) {
            const deltaX = this.dragState.prevX - touch.pageX;
            this.comicImages.scrollLeft += deltaX;
            this.dragState.prevX = touch.pageX;
        }
        if (touch.pageY > 0) {
            const deltaY = this.dragState.prevY - touch.pageY;
            this.comicImages.scrollTop += deltaY;
            this.dragState.prevY = touch.pageY;
        }
    }
    
    imgDragStart(e) {
        this.dragState.prevX = e.pageX;
        this.dragState.prevY = e.pageY;
        this.dragState.isDragging = true;
        e.preventDefault();
    };
    touchStart(e) {
        if (e.touches.length !== 1) return; 
        const touch = e.touches[0];
        this.dragState.prevX = touch.pageX;
        this.dragState.prevY = touch.pageY;
        this.dragState.isDragging = true;
        e.preventDefault();
    };
    
    imgDragEnd() {
        this.dragState.isDragging = false;
    };
    
    // wheel on bottom to next image
    doWheel(e) {
        e.preventDefault();
        const deltaY = e.deltaY || e.wheelDeltaY || e.detail || 0;
        
        // 이미지 컨테이너의 현재 스크롤 상태 확인
        const isAtTop = this.comicImages.scrollTop <= 0;
        const isAtBottom = this.comicImages.scrollTop + this.comicImages.clientHeight >= this.comicImages.scrollHeight - 1;
        
        // 위/아래 경계에 있고 해당 방향으로 더 스크롤하려는 경우
        if ((isAtTop && deltaY < 0) || (isAtBottom && deltaY > 0)) {
            // 즉시 페이지 전환 (스크롤 없이)
            deltaY > 0 ? this.nextPanel() : this.prevPanel();
            return;
        }
        
        // 그 외의 경우 정상 스크롤 처리
        this.comicImages.scrollTo({
            top: this.comicImages.scrollTop + deltaY,
            behavior: 'smooth'
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
    };
    
    interalKeyHandler(e) {
        switch (e.key.toLowerCase()) {
            case 'h':
            case 'a':
            case 'arrowleft':
                this.prevEpisode();
                break;
            case 'l':
            case 'd':
            case 'arrowright':
                this.nextEpisode();
                break;
            case 'j':
            case 'd':
            case 'arrowdown':
                this.nextPanel();
                break;
            case 'k':
            case 'w':
            case 'arrowup':
                this.prevPanel();
                break;
            case 'f':
                this.toggleSpread();
                break;
            case 'v':
                this.changeFit();
                break;
            case 'c':
                this.renderChange();
                break;
            case 'enter':
                this.toggleViewer();
                break;
            case ' ':
                this.toggleFullscreen();
                break;
            case 't':
                this.toggleTimer();
                break;
            case 'r':
                this.reloadCurrentImg();
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
    
    disable(elem) {
        elem.parentElement.classList.add('disabled');
        elem.firstChild.classList.remove('icon_white');
    }
    
    enable(elem) {
        elem.parentElement.classList.remove('disabled');
        elem.firstChild.classList.add('icon_white');
    }
    
    /**
     * @param {Element} element - target element
     * @param {number} visibleRatio - visible ratio (0.0 ~ 1.0). Default is 0.5 (50%)
     * @param {Element} [rootElement=null] - root element for intersection observer (optional)
     * @returns {Promise<boolean>} - true if element is visible more than specific ratio, false otherwise
     */
    isElementVisible(element, visibleRatio = 0.5, rootElement = null) {
        return new Promise(resolve => {
            options = {
                root: rootElement,
                rootMargin: '0px',
                threshold: visibleRatio
            }
            const observer = new IntersectionObserver(entries => {
                resolve(entries[0].intersectionRatio >= visibleRatio);
                observer.disconnect();
            }, options);
            
            observer.observe(element);
        });
    }
    
    scrollToElem(scroll_elem, target_elem, option = { behavior: 'smooth', block: 'center' }) {
        if (scroll_elem == null || target_elem == null) return;
        // check if target_elem is descendant of scroll_elem
        if (!scroll_elem.contains(target_elem)) {
            console.warn(`Target element is not a descendant of scroll element: ${target_elem}`);
            return;
        }
    
        // Get the target element's position relative to the scroll container
        const targetTop = target_elem.offsetTop - scroll_elem.offsetTop;
        const targetHeight = target_elem.offsetHeight;
        const containerHeight = scroll_elem.clientHeight;
    
        let ttop = 0;
        // Calculate the scroll position based on the block option
        switch (option.block) {
            case 'start':
                ttop = targetTop; // Align the top of the target element with the top of the container
                break;
            case 'end':
                ttop = targetTop + targetHeight - containerHeight; // Align the bottom of the target element with the bottom of the container
                break;
            case 'nearest':
                const scrollTop = scroll_elem.scrollTop;
                const scrollBottom = scrollTop + containerHeight;
                const targetBottom = targetTop + targetHeight;
    
                if (targetBottom <= scrollBottom && targetTop >= scrollTop) {
                    // Already visible, no need to scroll
                    ttop = scrollTop;
                } else if (targetTop < scrollTop) {
                    // Scroll up to make the top of the target element visible
                    ttop = targetTop;
                } else {
                    // Scroll down to make the bottom of the target element visible
                    ttop = targetBottom - containerHeight;
                }
                break;
            case 'center':
            default:
                ttop = targetTop - (containerHeight - targetHeight) / 2; // Center the target element in the container
                break;
        }
        var tleft = target_elem.offsetLeft;
        // scroll_elem.scrollTop = ttop;
        // scroll_elem.scrollLeft = tleft;
        scroll_elem.scrollTo({
            top: ttop,
            left: tleft,
            behavior: option.behavior,
        });
        // 왜구현했냐이거대체
    }
    
    /**
     * Find the element closest to the target scroll position
     * @param {string} selector - CSS selector for the target elements.
     * @param {position} position - The target scroll position [top, mid, bottom] (default is center of the window).
     * @returns {HTMLElement|null} - The closest element to the target scroll position, or null if not found.
     * */
    findElementAtScroll(selector, position = 'mid') {
        if (!selector) return null;
    
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0) return null;
        
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const windowHeight = window.innerHeight;
    
        let targetPoint;
        switch (position.toLowerCase()) {
            case 'top':
                targetPoint = scrollTop + (windowHeight * 0.25);
                break;
            case 'bottom':
                targetPoint = scrollTop + (windowHeight * 0.75);
                break;
            case 'mid':
            default:
                targetPoint = scrollTop + (windowHeight * 0.5);
                break;
        }
    
        let bestMatch = null;
        let minDistance = Infinity;
        
        Array.from(elements).forEach((element, index) => {
            const rect = element.getBoundingClientRect();
            
            // 요소의 위치 계산 (스크롤 위치 포함)
            const elementTop = rect.top + scrollTop;
            const elementBottom = rect.bottom + scrollTop;
            const elementHeight = rect.height;
            
            // 위치에 따라 요소의 참조점 결정
            let referencePoint;
            switch (position.toLowerCase()) {
                case 'top':
                    referencePoint = elementTop; // 요소의 상단
                    break;
                case 'bottom':
                    referencePoint = elementBottom; // 요소의 하단
                    break;
                case 'mid':
                default:
                    referencePoint = elementTop + (elementHeight / 2); // 요소의 중앙
                    break;
            }
            
            // 타겟 지점과의 거리 계산
            const distance = Math.abs(referencePoint - targetPoint);
            
            // 가장 가까운 요소 업데이트
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = { element, index };
            }
        });
        
        return bestMatch;
    }
    
    /**
     * Helper to make moveOriginalByViewer function; move to idx-th element by querySelectorAll(selector)
     * */
    makeMoveOriginalByViewer(selector) {
        return (idx) => {
            const elements = document.querySelectorAll(selector);
            if (elements.length > idx) {
                elements[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
                console.warn(`Element at index ${idx} not found for selector "${selector}"`);
            }
        }
    }
    
    sleepSync(ms) {
        // can cause UI freeze
        var start = new Date().getTime();
        while (new Date().getTime() < start + ms) {
            // do nothing
        }
    }
    
    sleepAsync(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    openInNewTab(url) {
        var win = window.open(url, '_blank');
        win.focus();
    }
    
    // code from koreapyj/dcinside_lite
    xmlhttpRequest(details) {
        var bfloc = null;
        var xmlhttp = new XMLHttpRequest();
    
        if (details.withCredentials) {
            xmlhttp.withCredentials = true;
        }
    
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
    
    simpleRequestAsync(url, method = 'GET', headers = {}, data = null, withCredentials = true) {
        return new Promise((resolve, reject) => {
            var details = {
                method,
                url,
                timeout: 10000,
                withCredentials: withCredentials,
                ontimeout: (e) => reject(new Error("Request timed out")),
                onload: (response) => {
                    if (response.status >= 200 && response.status < 300) {
                        resolve(response)
                    } else {
                        reject(response)
                    }
                },
                onerror: (error) => reject(error)
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
        user-select: none;
    }
    body {
        background: #171717;
        font-size: 15px;
        font-weight: bold;
        background-color: #171717 !important;
        color: #999;
        height: 100%;
        display: flex;
        flex-direction: column;
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
        height: 100%;
        width: 100%;
        position: relative;
        overflow: auto;
        text-align: center;
        white-space: nowrap;
    }
        
    #centerer {
        display: inline-block;
        height: 100%;
        width: 100%;
        align-items: center;
        justify-content: center;
    }
    
    #centerer img{
        margin: auto;
    }
    
    .spread2 #comicImages img.lt_img {
        object-position: right center;
        margin: 0px 0px 0px auto;
    }
    .spread2 #comicImages img.rt_img {
        object-position: left center;
        margin : 0px auto 0px 0px;
    }
    
    /* vanila state */
    img {
        display: inline-block;
    }
    
    /* stretchBoth */
    .stretchBoth img {
        display: inline-block;
        width: 100%;
        height: 100%;
        object-fit: contain;
    }
    
    /* stretchHorizontal */
    #centerer.stretchHorizontal {
        align-items: flex-start;
    }
    .stretchHorizontal img {
        display: inline-block;
        width: 100%;
        height: auto;
    }
    
    /* stretchVertical */
    .stretchVertical img {
        display: inline-block;
        width: auto;
        height: 100%;
    }
    
    /* fitBoth */
    .fitBoth img {
        display: inline-block;
        max-width: 100%;
        max-height: 100%;
    }
    .spread2 .fitBoth img {
        max-width: 50%;
    }
    
    /* fitHorizontal styles */
    #centerer.fitHorizontal {
        align-items: flex-start;
    }
    .fitHorizontal img {
        display: inline-block;
        max-width: 100%;
    }
    .spread2 .fitHorizontal img {
        max-height: none;
        max-width: 50%;
    }
    
    /* fitVertical styles */
    .fitVertical img {
        display: inline-block;
        max-height: 100%;
    }
    .spread2 .fitVertical img {
        max-width: none;
        max-height: 100%;
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
    
    .icon_white {
        color: white;
    }
    .imageBtn,
    .imageBtn:hover {
        position: absolute;
        z-index: 1;
        width: 35%;
        height: 100%;
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
    
    .input-medium {
        margin: 15px 15px 15px 3px;
        height: 20px;
        width: 58px;
    }
    #preloadInput {
        margin: 0px 10px;
        width: 3em;
        height: 1.8em;
    }
    
    #pageTimer {
        margin-left: 0.5rem;
        height: 2rem;
        width: 3rem;
    }
    #single-page-select {
        margin-left: 0.5rem;
        height: 2rem;
        width: 4rem;
    }
    
    #interfaceNav {
        padding: 0.2rem;
    }
    
    #funcs .nav-item:not(:first-child)  {
        padding-left: 0.5rem;
        margin-left: 0.5rem;
    }
    
    /* Render options */
    .render_auto img {
        image-rendering: auto;
    }
    
    .render_crisp img {
        image-rendering: -moz-crisp-edges; image-rendering: -webkit-optimize-contrast;
    }
    
    .render_pixelated img {
        image-rendering: pixelated;
    }
    
    .display_block {
        display: block !important;
    }
    .display_none {
        display: none !important;
    }
    
    .thumbnail_wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 9em;
        width: min-content;
        height: min-content;
        background-color:rgba(60, 60, 60, 0.2);
        margin: 2px;
    }
    
    .thumbnail_wrapper > * {
        max-width: 100%;
        max-height: 100%;
    }
    
    #thumb_content {
        width: 100%;
        height: 100%;
    }
    
    /* fullscreen buttons */
    #fullBtnTopRt {
        display: none;
        position: fixed;
        top: 0;
        right: 10px;
        z-index: 1000;
        margin: 10px;
        font-size: 20px;
        color: rgba(255, 255, 255, 0.3);
    }`
    
    // ============== Dynamic styles ==============
    breakpoints = [
        { name: 'xs', width: 0 },
        { name: 'sm', width: 576 },
        { name: 'md', width: 768 },
        { name: 'lg', width: 992 },
        { name: 'xl', width: 1200 },
        { name: 'xxl', width: 1400 }
    ];
    
    d_style = `
    @media (max-width: {bp_width-1}px) {
    
    }
    @media (min-width: {bp_width}px) {
        .seperator-{bp_name}:not(:first-child)  {
            border-left: 1px solid #4b4b4b;
        }
    }`
    makeDynamicStyles() {
        var ret;
        this.breakpoints.forEach((bp) => {
            var style = this.d_style
                .replace(/{bp_name}/g, bp.name)
                .replace(/{bp_width}/g, bp.width)
                .replace(/{bp_width-1}/g, bp.width -1);
            ret += style;
        });
        return ret;
    }
    
    fullscreen_style = `
    .modal-backdrop:-webkit-full-screen,
    .modal-backdrop:-moz-full-screen,
    .modal-backdrop:-ms-fullscreen,
    .modal-backdrop:fullscreen {
        background-color: rgba(0, 0, 0, 0.5) !important;
        z-index: 1040 !important;
    }
    `
    
    // ============== HTML ==============
    navbarHTML = `
    <nav id="interfaceNav" class="navbar bg-dark navbar-expand-lg" data-bs-theme="dark" aria-label="Main navigation">
    <div class="container-fluid">
        <a class="navbar-brand" id="galleryInfo">Gallery</a>
        <button id="navbar-button" class="navbar-toggler" data-bs-toggle="collapse" data-bs-target="#collapseNavbar">
        <span class="navbar-toggler-icon"></span>
        </button>
        <div class="collapse navbar-collapse justify-content-center" id="collapseNavbar">
        <ul id="funcs" class="navbar-nav text-end">
            <li class="seperator-lg nav-item">
                <a class="nav-link" title="Left arrow or j" id="nextPanel"><i class="bi bi-chevron-left"></i> Next</a>
            </li>
            <li class="seperator-lg nav-item"><a class="nav-link" title="Right arrow or k" id="prevPanel"><i class="bi bi-chevron-right"></i> Prev</a>
            </li>
            <li class="seperator-lg nav-item">
                <div class="align-items-center">
                    <a id="autoPager" title="t">▶Auto</a>
                    <input id="pageTimer" class="form-control-sm" type="text" value="10">
                </div>
            </li>
            <li class="seperator-lg nav-item">
                <div class="align-items-center">
                    <a id="pageChanger">#</a>
                    <select class="form-select-sm" id="single-page-select"></select>
                </div>
            </li>
            <li class="seperator-lg nav-item">
                <a class="nav-link" id="thumbnailBtn" title="Show Thumbnails" data-bs-toggle="modal" data-bs-target="#thumbnailModal">
                    <i class="bi bi-grid"></i>
                </a>
            </li>
            <li class="seperator-lg nav-item">
                <a class="nav-link" id="fullscreener" title="Space">
                    <i class="bi bi-arrows-fullscreen"></i>
                </a>
            </li>
            <li class="seperator-lg nav-item dropdown">
                <a class="nav-link dropdown-toggle" href="#" id="navbarDropdownOptions" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                    Options<span class="caret"></span>
                </a>
                <ul class="seperator-lg dropdown-menu dropdown-menu-dark aria-labelledby="navbarDropdownOptions">
                    <li>
                        <a class="dropdown-item" title="r" id="reload">
                            <span>&#10227;</span> Reload
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item fitBtn" title="b" id="fitChanger">
                            <i class="bi bi-arrows-move"></i> Change Fit
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item" title="f" id="spreadChanger">
                            <i class="bi bi-book"></i> Full Spread
                        </a>
                    </li>
                    <li>
                        <a class="dropdown-item" title="rendering" id="renderingChanger">
                            <i class="bi bi-brush"></i> Rendering
                        </a>
                    </li>
                    <li>
                    <a class="dropdown-item" title="p" id="preloader">
                        Preload<input id="preloadInput" type="text" value="50">
                    </a>
                </ul>
            </li>
            <li class="seperator-lg nav-item">
                <a class="nav-link" title="Close viewer" id="viewerCloser">
                    <i class="bi bi-x-lg"></i>
                </a>
            </li>
        </ul>
        </div>
    </div>
    </nav>
    `
    
    thumbnailModalHTML = `
    <div id="thumbnailModal" class="modal fade" tabindex="-1" data-bs-theme="dark" aria-labelledby="thumbnailModalLabel" aria-hidden="true">
        <div class="modal-dialog modal-xl modal-dialog-scrollable modal-fullscreen-lg-down">
            <div id="thumb_content" class="modal-content text-light">
                <div class="modal-header d-flex justify-content-between" style="padding:0rem 0.3rem;">
                    <div></div>
                    <div><h6 class="modal-title" id="thumbnailModalLabel">Thumbnails</h5></div>
                    <div><button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close" style="margin:0"></button></div>  
                </div>
                <div id="thumb_container" class="modal-body d-flex flex-wrap justify-content-center align-items-center">
                </div>
                <!-- <div class="modal-footer"><button type="button" class="btn btn-primary" id="addthumb">Add thumb</button></div> -->
            </div>
        </div>
    </div>
    `
    
    imgFrameHTML = `
    <div id="comicImages" tabindex="1">
        <div id="fullBtnTopRt" class="flullscreenBtns">
                <a id="fullThumbnailBtn" title="Show Thumbnails" data-bs-toggle="modal" data-bs-target="#thumbnailModal"><i class="bi bi-grid"></i></a>
                <a id="fullscreen" title="Space"><i class="bi bi-arrows-fullscreen"></i></a>
        </div>
        <div id="centerer" class="d-flex">
            <a id="leftBtn" class="imageBtn"></a>
            <a id="rightBtn" class="imageBtn"></a>
        </div>
        ${this.thumbnailModalHTML}
    </div>
    <div id="preload"></div>
    `
}

(()=>{
'use strict';

var exhaust;
var API = null;
var S_API = null;
var API_AVAIL = true;
var GID = null;
var TOKEN = null;
var BASE = null;
var IMAGELIST = [];
var IS_MPV = null;
var MPVKEY = null;
var PAGECOUNT = null
var host = document.location.host;

if (host === 'exhentai.org') {
    BASE = 'https://exhentai.org';
    API = 'https://exhentai.org/api.php';
    S_API = 'https://s.exhentai.org/api.php';
} else if (host === 'e-hentai.org') {
    BASE = 'https://e-hentai.org';
    API = 'https://e-hentai.org/api.php';
    S_API = 'https://api.e-hentai.org/api.php';
} else {
    alert("Host unavailable!\nHOST: "+host);
}

// ============== Exh specific functions ==============
function set_gallery_data() {
    // mpv only
    var scripts = document.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
        if (scripts[i].innerText.includes('var gid=')) {
            const extract = new Function(`${scripts[i].innerText}
                return {
                    gid: gid,
                    mpvkey: mpvkey,
                    pagecount: pagecount,
                    imagelist: imagelist,
                }`
            )
            var ext = extract();
            GID = ext.gid;
            IMAGELIST = ext.imagelist;
            MPVKEY = ext.mpvkey;
            PAGECOUNT = ext.pagecount;
            return ext;
        }
    }
    return null;
}

function is_mpv() {
    if (IS_MPV !== null) return IS_MPV;
    // check if the current page is mpv
    const path = document.location.pathname;
    IS_MPV = path.includes('/mpv/');
    return IS_MPV;
}

async function getToken() {
    // GID_TOKEN이 이미 존재하면 즉시 반환
    if (GID && TOKEN) return {gid: GID, token: TOKEN};
    var gid;
    var imagekey;
    var page;
    const path = document.location.pathname;
    if (is_mpv()) {
        await set_gallery_data();
        // mpv : /mpv/3201509/2f4559c310/#page2
        // /mpv/<gid>/<???>/#page<page>
        if (!IMAGELIST) {
            throw new Error("imagelist not found");
        }
        var hash = document.location.hash;

        // use first image to get token
        imagekey = IMAGELIST[0]["k"];
        gid = path.split('/')[2];
        page = 1;
    } else {
        // single : /s/f2e488999a/3201509-1
        // /s/<imageKey>/<gid>-<page>
        var splits = path.split('/');
        imagekey = splits[2];
        gid = splits[3].split('-')[0];
        page = splits[3].split('-')[1];
    }

    const data = {
        method: 'gtoken',
        pagelist: [[gid, imagekey, page]] // [gid, imageKey, page]
    };

    try {
        // simpleRequestAsync로 API 호출
        const response = await exhaust.simpleRequestAsync(API, 'POST', { 'Content-Type': 'application/json' }, JSON.stringify(data));

        // 응답을 JSON으로 파싱 후 토큰 저장
        const tokens = JSON.parse(response.responseText).tokenlist[0];
        GID = tokens.gid;
        TOKEN = tokens.token;
        return { gid: GID, token: TOKEN };

    } catch (error) {
        console.error("Error fetching token:", error);
        throw error;  // 호출한 곳에서 에러를 처리할 수 있도록 다시 던짐
    }
}

async function getGdataAsync(gid, token) {
    var data = {
        'method': 'gdata',
        'gidlist': [[gid, token]]
    };
    const response = await exhaust.simpleRequestAsync(API, 'POST', {}, JSON.stringify(data));
    return response;
};

async function extract_page (url, idx) {
    const response = await exhaust.simpleRequestAsync(url);  // 비동기 요청 대기
    const doc = exhaust.parseHTML(response);

    // 파일 정보에서 이미지 크기 추출
    const fileInfoText = doc.getElementById('i4').firstChild.firstChild.textContent;
    const fileInfoMatch = fileInfoText.match(/ :: (\d+) x (\d+)/);
    if (!fileInfoMatch) throw new Error("File info not found");

    const loadFailAttr = doc.getElementById("loadfail").getAttribute("onclick");
    const nlMatch = loadFailAttr.match(/nl\('(.*)'\)/);
    if (!nlMatch) throw new Error("NL value not found");

    var nl_url = url.replace(/\?.*/, '') + '?nl=' + nlMatch[1];
    
    return {
        path: doc.getElementById('img').src,
        width: Number(fileInfoMatch[1]),
        height: Number(fileInfoMatch[2]),
        nl: nl_url,
    }
}

function loadImageAsync(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        img.src = src;
    });
}

// to maintain compability, use closure
function make_extract_api(gid, imagelist, mpvkey) {
    return async(url, idx) => {
        // before api call, check original page if image already loaded
        const img_elem = document.querySelector('#imgsrc_'+(idx+1));
        if (img_elem && img_elem.src && img_elem.complete && img_elem.naturalWidth > 0) {
            var is_loaded = false;
            try {
                await loadImageAsync(img_elem.src);
                is_loaded = true;
            } catch (error) {
            }
            if (is_loaded) {
                // width/height is inaccurate but faster.
                // if it cause problem, then use =>  var img = new Image(); img.onload = ()=>{resolve({ width: this.naturalWidth, height: this.naturalHeight})}; img.src = url;
                return {
                    path : img_elem.src,
                    width : img_elem.width,
                    height : img_elem.height,
                    nl : null
                };
            }
        }

        if (!API_AVAIL) {
            return null;
        }

        const imgkey = imagelist[idx].k;
        const nl = imagelist[idx].nl;
        const page = idx + 1; // page starts from 1

        var payload = {
            gid: gid,
            method: 'imagedispatch',
            imgkey: imgkey,
            mpvkey: mpvkey,
            page: page
        };
        if (nl) { payload.nl = nl; };

        try {
            const response = await exhaust.simpleRequestAsync(S_API, 'POST',
                { 'Content-Type': 'application/json' }, 
                JSON.stringify(payload)
            );
            // example response
            // {"d":"1280 x 1870 :: 143.7 KiB","o":"Download original 1498 x 2189 691.3 KiB source","lf":"fullimg\/3201509\/5\/5knnxxvadx1\/batch_250104_09483266.jpg","ls":"?f_shash=a6422374e86f1a0aa599b184aed3486cb9356c73&fs_from=batch_250104_09483266.webp+from+%28Hedera%29+Suomi+%28Patreon%29+%5BAi+Generated%5D","ll":"a6422374e86f1a0aa599b184aed3486cb9356c73-707879-1498-2189-jpg\/forumtoken\/3201509-5\/batch_250104_09483266.webp","lo":"s\/a6422374e8\/3201509-5","xres":"1280","yres":"1870","i":"https:\/\/kynlskr.mqqquvqcmmzg.hath.network\/h\/3dd67a4edbdfa53f2cfa2df36747cd206af646f7-147164-1280-1870-wbp\/keystamp=1744552200-b069c77a4b;fileindex=172110486;xres=1280\/batch_250104_09483266.webp","s":"41611"}    // d = 1280 x 1870 :: 147.7 KiB
            // d = 1280 x 1870 :: 143.7 KiB
            // o = Download original 1498 x 2189 691.3 KiB source
            // lf = fullimg/3201509/5/5knnxxvadx1/batch_250104_09483266.jpg
            // ls = ?f_shash=a6422374e86f1a0aa599b184aed3486cb9356c73&fs_from=batch_250104_09483266.webp+from+%28Hedera%29+Suomi+%28Patreon%29+%5BAi+Generated%5D
            // ll = a6422374e86f1a0aa599b184aed3486cb9356c73-707879-1498-2189-jpg/forumtoken/3201509-5/batch_250104_09483266.webp
            // lo = s/a6422374e8/3201509-5
            // xres = 1280
            // yres = 1870
            // i = https://kynlskr.mqqquvqcmmzg.hath.network/h/3dd67a4edbdfa53f2cfa2df36747cd206af646f7-147164-1280-1870-wbp/keystamp=1744552200-b069c77a4b;fileindex=172110486;xres=1280/batch_250104_09483266.webp
            // s = 41611  <- this means nl
            const parsed = JSON.parse(response.responseText);
            imagelist[idx].nl = parsed.s;
            return {
                path: parsed.i,
                width: Number(parsed.xres),
                height: Number(parsed.yres),
                nl: parsed.s
            }
        } catch (error) {
            console.error("Error fetching image data:", error);
            console.log("API call failed. diable API call.");
            API_AVAIL = false; // disable api call for moment
            setTimeout(()=>{API_AVAIL = true;}, 10 * 1000);
            return null;
        }
    }
}

function make_gallery_url(gid, token) {
    return 'https://' + host + '/g/' + gid + '/' + token;
}

function scroll_to_image(page) {
    const nth_image = document.querySelector('#image_'+(page));
    if (nth_image) {
        nth_image.scrollIntoView({block : 'start'});
    }
    return page;
}

function page_from_original() {
    // assume last image that visible 
    var selector = 'div.mimg';
    var best_match = exhaust.findElementAtScroll(selector, 'top');
    if (best_match) {
        // ex) <div id="image_16" class="mimg" style="height: 880px; visibility: visible; max-width: 1280px;">
        var id_ = best_match.element.id;
        var page = id_.split('_')[1];
        return Number(page)
    } else {
        return null;
    }
}

function get_thumb_size(idx) {
    var thumb_elem = document.querySelector('#thumb_'+(idx+1));
    var width = thumb_elem.clientWidth;
    var height = thumb_elem.clientHeight;
    return {width: width, height: height};
}

function make_mpv_thumbnails() {
    return IMAGELIST.reduce((pv, cv, ci) => {
        // n: "batch_250212_20455664.jpg"
        // t: "(https://zurswtyclg.hath.network/c2/0sslqmehw2ww9qzb7/3302769-0.webp) -0px 0"
        // <div id="thumb_1" style="width: 200px; height: 292px; visibility: visible; background: transparent url(&quot;https://zurswtyclg.hath.network/c2/0sslqmehw2ww9qzb7/3302769-0.webp&quot;) 0px 0px no-repeat;" title="Page 1 - batch_250212_20455664.jpg"></div>
        var thumb_dim = get_thumb_size(ci);

        // make thumbnail div
        var thumb_elem = document.createElement('div');
        thumb_elem.id = 'thumb_' + (ci+1);
        thumb_elem.style.background = "transparent url" + cv.t + " no-repeat";
        thumb_elem.title = "Page " + (ci+1) + " - " + cv.n;
        thumb_elem.style.width = thumb_dim.width + 'px';
        thumb_elem.style.height = thumb_dim.height + 'px';
        thumb_elem.style.visibility = 'visible';

        pv.push(thumb_elem);
        return pv;
    }, []);
}

async function init () {
    var cur_url = document.location.href;
    // check single or multipage view by path
    // ex) single = https://exhentai.org/s/f2e488999a/3201509-1
    // ex) multi = https://exhentai.org/mpv/3201509/2f4559c310/#page1
    var is_single = cur_url.split('/')[3] == 's';

    var curPanel = 1;
    if (is_single) {
        curPanel = Number(cur_url.substring(cur_url.lastIndexOf('-') + 1));
    }
    
    exhaust = new EXHaustViewer(curPanel);
    exhaust.extractImageData = extract_page;
    exhaust.clearHotkeys();

    // prev/next episode function is useless in exhentai
    exhaust.prevEpisode = exhaust.nextPanel;
    exhaust.nextEpisode = exhaust.prevPanel;

    // add button to iframe visible
    if (is_single) {
        exhaust.addShowbutton('.sn');
    } else {
        exhaust.addShowbutton('#bar3');
    }

    exhaust.setGlobalHotkey('Enter', () => {
        exhaust.toggleViewer();
    });

    if (is_mpv()) {
        getToken()
        .then(token => {
            exhaust.gallery_url = make_gallery_url(token.gid, token.token);
            exhaust.setGalleryTitle(null, document.title);
            return set_gallery_data();
        })
        .then((ext) => {
            exhaust.set_number_of_images(PAGECOUNT, false);

            var thumbnail_elems = make_mpv_thumbnails();
            exhaust.batchAddThumbnails(thumbnail_elems);

            // override original functions
            exhaust.extractImageData = make_extract_api(GID, IMAGELIST, MPVKEY);
            exhaust.getPageFromOriginal = page_from_original;

            // adding handler
            exhaust.addPageChangedHandler(scroll_to_image);

            for (var i = 0; i < IMAGELIST.length; i++) {
                var imgkey = IMAGELIST[i].k;
                var img_url = BASE + '/s/' + imgkey + '/' + GID + '-' + (i+1);
                var img_data = {
                    page: i+1,
                    url: img_url,
                    token: imgkey
                };
                exhaust.setImgData(i, img_data);
            }
        })
        .then(() => {
            exhaust.finally()
        })
    } else {
        // no mpv
        getToken()
        .then(token => {
            exhaust.gallery_url = make_gallery_url(token.gid, token.token);
            exhaust.setGalleryTitle(null, document.title);
            return getGdataAsync(token.gid, token.token)
        })
        .then((response) => {
            // make image list
            var gmetadata = JSON.parse(response.responseText).gmetadata[0];
            exhaust.set_number_of_images(Number(gmetadata.filecount), true);
            var gallery_page_url = make_gallery_url(gmetadata.gid, gmetadata.token) + '/?p=';

            var pushImgs = function (doc) {
                var imgs = doc.querySelectorAll("#gdt > a");
                for (var idx = 0; idx < imgs.length; idx++) {
                    var regex_temp = /^(?:.*?\/\/)(?:.*?\/)(?:.*?\/)(.*?)\/(\d*?)-(\d+)(?:\?.*)*(?:#\d+)*$/g;
                    var img = imgs[idx];
                    var url_temp = img.href;
                    var match_temp = regex_temp.exec(url_temp);
                    // match [1] = image token, [2] = gid, [3] = page number
                    // image token is not same as gid token
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
            .then(async ()=>{
                exhaust.finally()
                // load rest of galleries
                for (var i = 1; i < gallery_page_len+1; i++) {
                    // sleep 1 seconds between requests
                    await exhaust.sleepAsync(500);

                    if (i+1 !== current_gallery_page) {
                        var now = Date.now();
                        exhaust.simpleRequestAsync(gallery_page_url + i)
                        .then(exhaust.parseHTML)
                        .then(pushImgs);
                    }
                }
            });
        })
        .catch(error => console.error("Error initializing viewer:", error));
    }
    exhaust.openViewer();
};
init();
})();
