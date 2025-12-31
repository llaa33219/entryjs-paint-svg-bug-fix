/**
 * SVG Namespace Normalizer (Auto-Execute Version)
 * 
 * base64 이미지가 포함된 SVG에서 발생하는 xlink 네임스페이스 문제를 해결합니다.
 * 
 * 일부 SVG 편집기에서 ns1:href 등 비표준 접두사로 xlink를 사용하면
 * XML 파싱 에러가 발생하는데, 이를 표준 xlink:href로 변환합니다.
 * 
 * ★ 이 스크립트는 로드 시 자동으로 실행되어 Entry.js에 통합됩니다. ★
 * 
 * @author Entry.js Team
 * @version 1.2.0
 * 
 * @example
 * // 브라우저에서 사용 - 스크립트 로드만 하면 자동 실행됨:
 * <script src="svg-namespace-normalizer.js"></script>
 * 
 * @example
 * // 수동으로 사용할 경우:
 * const normalized = SvgNamespaceNormalizer.normalize(svgString);
 */

(function (root, factory) {
    // UMD (Universal Module Definition) 패턴
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node.js / CommonJS
        module.exports = factory();
    } else {
        // 브라우저 전역 변수
        root.SvgNamespaceNormalizer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var SvgNamespaceNormalizer = {};
    var isInitialized = false;
    var originalFetch = null;

    /**
     * SVG 문자열에서 xlink 네임스페이스 문제가 있는지 감지합니다.
     * 
     * @param {string} svgString - 검사할 SVG 문자열
     * @returns {boolean} xlink 네임스페이스 문제가 있으면 true
     */
    SvgNamespaceNormalizer.hasIssue = function (svgString) {
        if (!svgString || typeof svgString !== 'string') {
            return false;
        }
        // xmlns:ns\d+="...xlink..." 패턴이 있는지 확인 (xlink를 가리키는 ns 접두사)
        return /xmlns:ns\d+\s*=\s*["']http:\/\/www\.w3\.org\/1999\/xlink["']/i.test(svgString);
    };

    /**
     * SVG 네임스페이스 정규화 함수
     * 
     * base64 이미지가 포함된 SVG에서 ns1:href 등의 비표준 xlink 네임스페이스 접두사를
     * 표준 xlink:href로 변환합니다.
     * 
     * @param {string} svgString - 정규화할 SVG 문자열
     * @returns {string} 정규화된 SVG 문자열
     * 
     * @example
     * // 변환 전: <image xmlns:ns1="http://www.w3.org/1999/xlink" ns1:href="data:image/png;base64,..."/>
     * // 변환 후: <image xlink:href="data:image/png;base64,..."/> (+ svg에 xmlns:xlink 추가)
     */
    SvgNamespaceNormalizer.normalize = function (svgString) {
        if (!svgString || typeof svgString !== 'string') {
            return svgString;
        }

        var result = svgString;
        
        // 1. base64 데이터 URL을 보호하기 위한 플레이스홀더 처리
        var base64Placeholders = [];
        var placeholderPrefix = '___BASE64_PLACEHOLDER_';
        var placeholderSuffix = '___';
        
        // 큰따옴표로 감싸진 base64 데이터 URL (줄바꿈, 공백 포함 - [\s\S]*? 사용)
        result = result.replace(/"data:image\/[^;]+;base64,[\s\S]*?"/g, function(match) {
            var index = base64Placeholders.length;
            base64Placeholders.push(match);
            return placeholderPrefix + index + placeholderSuffix;
        });
        
        // 작은따옴표로 감싸진 base64 데이터 URL (줄바꿈, 공백 포함 - [\s\S]*? 사용)
        result = result.replace(/'data:image\/[^;]+;base64,[\s\S]*?'/g, function(match) {
            var index = base64Placeholders.length;
            base64Placeholders.push(match);
            return placeholderPrefix + index + placeholderSuffix;
        });

        // 2. SVG 내부 ID 참조 보호 (url(#id), xlink:href="#id" 등)
        var idRefPlaceholders = [];
        var idRefPlaceholderPrefix = '___IDREF_PLACEHOLDER_';
        var idRefPlaceholderSuffix = '___';
        
        // url(#...) 패턴 보호 (빈 ID도 처리: url(#) 등)
        result = result.replace(/url\(\s*["']?#[^)"']*["']?\s*\)/gi, function(match) {
            var index = idRefPlaceholders.length;
            idRefPlaceholders.push(match);
            return idRefPlaceholderPrefix + index + idRefPlaceholderSuffix;
        });
        
        // xlink:href="#...", href="#...", ns1:href="#..." 등 내부 참조 보호 (빈 ID도 처리: href="#" 등)
        result = result.replace(/(xlink:href|ns\d+:href|href)\s*=\s*["']#[^"']*["']/gi, function(match) {
            var index = idRefPlaceholders.length;
            idRefPlaceholders.push(match);
            return idRefPlaceholderPrefix + index + idRefPlaceholderSuffix;
        });

        // 3. xlink 네임스페이스를 가리키는 ns 접두사 번호들을 추출
        // 예: xmlns:ns1="http://www.w3.org/1999/xlink" -> ns1이 xlink를 가리킴
        var xlinkNsPrefixes = [];
        var xlinkNsPattern = /xmlns:ns(\d+)\s*=\s*["']http:\/\/www\.w3\.org\/1999\/xlink["']/gi;
        var xlinkMatch;
        while ((xlinkMatch = xlinkNsPattern.exec(result)) !== null) {
            xlinkNsPrefixes.push(xlinkMatch[1]);
        }

        // xlink 관련 ns 접두사가 없으면 플레이스홀더 복원 후 조기 반환
        if (xlinkNsPrefixes.length === 0) {
            // ID 참조 복원
            for (var n = 0; n < idRefPlaceholders.length; n++) {
                var idRefPh = idRefPlaceholderPrefix + n + idRefPlaceholderSuffix;
                result = result.split(idRefPh).join(idRefPlaceholders[n]);
            }
            // base64 복원
            for (var m = 0; m < base64Placeholders.length; m++) {
                var ph = placeholderPrefix + m + placeholderSuffix;
                result = result.split(ph).join(base64Placeholders[m]);
            }
            return result;
        }

        // 4. xlink를 가리키는 ns 접두사의 속성을 xlink:로 변환
        // 예: ns1:href -> xlink:href (ns1이 xlink를 가리킬 때)
        for (var j = 0; j < xlinkNsPrefixes.length; j++) {
            var nsNum = xlinkNsPrefixes[j];
            var nsToXlinkPattern = new RegExp('\\s+ns' + nsNum + ':([a-zA-Z][a-zA-Z0-9-]*)\\s*=', 'gi');
            result = result.replace(nsToXlinkPattern, ' xlink:$1=');
        }

        // 5. xlink ns의 xmlns 선언을 표준 xmlns:xlink로 변환
        // 예: xmlns:ns1="http://www.w3.org/1999/xlink" -> xmlns:xlink="http://www.w3.org/1999/xlink"
        for (var k = 0; k < xlinkNsPrefixes.length; k++) {
            var nsNumForXmlns = xlinkNsPrefixes[k];
            var xmlnsPattern = new RegExp('xmlns:ns' + nsNumForXmlns + '(\\s*=\\s*["\']http://www\\.w3\\.org/1999/xlink["\'])', 'gi');
            result = result.replace(xmlnsPattern, 'xmlns:xlink$1');
        }

        // 6. xlink:href가 있는데 xmlns:xlink 선언이 없으면 svg 태그에 추가
        if (result.indexOf('xlink:href') !== -1 && result.indexOf('xmlns:xlink') === -1) {
            result = result.replace(
                /<svg([^>]*)>/i,
                '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">'
            );
        }

        // 7. ID 참조 플레이스홀더를 원래 데이터로 복원 (split/join 사용하여 $ 문제 방지)
        for (var p = 0; p < idRefPlaceholders.length; p++) {
            var idRefPlaceholder = idRefPlaceholderPrefix + p + idRefPlaceholderSuffix;
            result = result.split(idRefPlaceholder).join(idRefPlaceholders[p]);
        }

        // 8. base64 플레이스홀더를 원래 데이터로 복원 (split/join 사용하여 $ 문제 방지)
        for (var i = 0; i < base64Placeholders.length; i++) {
            var placeholder = placeholderPrefix + i + placeholderSuffix;
            result = result.split(placeholder).join(base64Placeholders[i]);
        }

        return result;
    };

    /**
     * SVG URL에서 SVG를 가져와서 네임스페이스를 정규화합니다.
     * 
     * @param {string} url - SVG 파일 URL
     * @param {Object} [options] - 옵션
     * @param {Object} [options.fetchOptions] - fetch 옵션
     * @returns {Promise<string>} 정규화된 SVG 문자열
     */
    SvgNamespaceNormalizer.fetchAndNormalize = function (url, options) {
        options = options || {};
        var fetchOptions = options.fetchOptions || {};

        return fetch(url, fetchOptions)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error('Failed to fetch SVG: ' + response.status);
                }
                return response.text();
            })
            .then(function (svgText) {
                return SvgNamespaceNormalizer.normalize(svgText);
            });
    };

    /**
     * SVG 문자열을 정규화된 Data URL로 변환합니다.
     * 
     * @param {string} svgString - SVG 문자열
     * @returns {string} 정규화된 SVG의 Data URL
     */
    SvgNamespaceNormalizer.toDataUrl = function (svgString) {
        var normalized = SvgNamespaceNormalizer.normalize(svgString);
        var encoded = encodeURIComponent(normalized)
            .replace(/'/g, '%27')
            .replace(/"/g, '%22');
        return 'data:image/svg+xml,' + encoded;
    };

    /**
     * SVG 문자열을 정규화된 Blob URL로 변환합니다.
     * 
     * @param {string} svgString - SVG 문자열
     * @returns {string} 정규화된 SVG의 Blob URL
     */
    SvgNamespaceNormalizer.toBlobUrl = function (svgString) {
        var normalized = SvgNamespaceNormalizer.normalize(svgString);
        var blob = new Blob([normalized], { type: 'image/svg+xml' });
        return URL.createObjectURL(blob);
    };

    /**
     * XMLHttpRequest를 사용하여 SVG를 가져와서 정규화합니다.
     * (fetch를 지원하지 않는 환경용)
     * 
     * @param {string} url - SVG 파일 URL
     * @param {function} callback - 콜백 함수 (error, normalizedSvg)
     */
    SvgNamespaceNormalizer.loadAndNormalize = function (url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    try {
                        var normalized = SvgNamespaceNormalizer.normalize(xhr.responseText);
                        callback(null, normalized);
                    } catch (e) {
                        callback(e, null);
                    }
                } else {
                    callback(new Error('Failed to load SVG: ' + xhr.status), null);
                }
            }
        };
        xhr.onerror = function () {
            callback(new Error('Network error while loading SVG'), null);
        };
        xhr.send();
    };

    /**
     * DOM에서 SVG 요소의 네임스페이스를 정규화합니다.
     * 
     * @param {Element} svgElement - SVG DOM 요소
     * @returns {Element} 정규화된 SVG DOM 요소 (새로 생성됨)
     */
    SvgNamespaceNormalizer.normalizeElement = function (svgElement) {
        if (!svgElement) {
            return svgElement;
        }

        var serializer = new XMLSerializer();
        var svgString = serializer.serializeToString(svgElement);
        var normalized = SvgNamespaceNormalizer.normalize(svgString);

        var parser = new DOMParser();
        var doc = parser.parseFromString(normalized, 'image/svg+xml');

        // 파싱 에러 체크
        var parserError = doc.querySelector('parsererror');
        if (parserError) {
            console.error('SVG parsing error:', parserError.textContent);
            return svgElement; // 원본 반환
        }

        return doc.documentElement;
    };

    /**
     * Entry.js와 통합하기 위한 함수
     * Entry.Utils에 함수들을 추가하고, 기존 함수들을 덮어씁니다.
     */
    SvgNamespaceNormalizer.integrateWithEntry = function () {
        // 이미 통합되었으면 중복 실행 방지
        if (SvgNamespaceNormalizer._entryIntegrated) {
            return true;
        }

        if (typeof Entry === 'undefined') {
            return false;
        }
        
        // Entry.Utils가 없으면 생성
        if (!Entry.Utils) {
            Entry.Utils = {};
        }

        // SVG 네임스페이스 정규화 함수들 추가 (기존 함수 덮어쓰기)
        Entry.Utils.normalizeSvgNamespace = SvgNamespaceNormalizer.normalize;
        Entry.Utils.hasSvgNamespaceIssue = SvgNamespaceNormalizer.hasIssue;
        Entry.Utils.fetchAndNormalizeSvg = SvgNamespaceNormalizer.fetchAndNormalize;
        Entry.Utils.svgToNormalizedDataUrl = SvgNamespaceNormalizer.toDataUrl;
        Entry.Utils.svgToNormalizedBlobUrl = SvgNamespaceNormalizer.toBlobUrl;
        Entry.Utils.loadAndNormalizeSvg = SvgNamespaceNormalizer.loadAndNormalize;
        Entry.Utils.normalizeSvgElement = SvgNamespaceNormalizer.normalizeElement;

        // 통합 완료 플래그 설정
        SvgNamespaceNormalizer._entryIntegrated = true;

        console.log('[SvgNamespaceNormalizer] Entry.Utils에 통합 완료 (기존 함수 덮어쓰기)');
        return true;
    };

    /**
     * fetch API를 패치하여 SVG 요청을 자동으로 정규화합니다.
     */
    SvgNamespaceNormalizer.patchFetch = function () {
        if (typeof fetch === 'undefined' || originalFetch) {
            return; // fetch가 없거나 이미 패치됨
        }

        originalFetch = fetch;

        window.fetch = function (url, options) {
            return originalFetch.apply(this, arguments).then(function (response) {
                // SVG 요청인지 확인
                var urlStr = typeof url === 'string' ? url : (url.url || '');
                var contentType = response.headers.get('content-type') || '';
                var isSvg = urlStr.toLowerCase().endsWith('.svg') || 
                            contentType.includes('image/svg');

                if (isSvg) {
                    // 원본 response를 복제하여 text를 읽고 정규화
                    return response.clone().text().then(function (svgText) {
                        if (SvgNamespaceNormalizer.hasIssue(svgText)) {
                            var normalized = SvgNamespaceNormalizer.normalize(svgText);
                            console.log('[SvgNamespaceNormalizer] SVG 네임스페이스 정규화:', urlStr);
                            
                            // 새로운 Response 객체 생성
                            return new Response(normalized, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            });
                        }
                        return response;
                    });
                }

                return response;
            });
        };

        console.log('[SvgNamespaceNormalizer] fetch API 패치 완료');
    };

    /**
     * XMLHttpRequest를 패치하여 SVG 요청을 자동으로 정규화합니다.
     */
    SvgNamespaceNormalizer.patchXHR = function () {
        var originalXHROpen = XMLHttpRequest.prototype.open;
        var originalXHRSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this._svgNormalizerUrl = url;
            return originalXHROpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            var xhr = this;
            var url = xhr._svgNormalizerUrl || '';
            var isSvg = typeof url === 'string' && url.toLowerCase().endsWith('.svg');

            if (isSvg) {
                var originalOnReadyStateChange = xhr.onreadystatechange;
                xhr.onreadystatechange = function () {
                    if (xhr.readyState === 4 && xhr.status === 200) {
                        var responseText = xhr.responseText;
                        if (SvgNamespaceNormalizer.hasIssue(responseText)) {
                            var normalized = SvgNamespaceNormalizer.normalize(responseText);
                            console.log('[SvgNamespaceNormalizer] XHR SVG 네임스페이스 정규화:', url);
                            
                            // responseText를 재정의 (가능한 경우)
                            try {
                                Object.defineProperty(xhr, 'responseText', {
                                    value: normalized,
                                    writable: false
                                });
                                Object.defineProperty(xhr, 'response', {
                                    value: normalized,
                                    writable: false
                                });
                            } catch (e) {
                                // 일부 브라우저에서는 재정의가 불가능할 수 있음
                            }
                        }
                    }
                    if (originalOnReadyStateChange) {
                        originalOnReadyStateChange.apply(this, arguments);
                    }
                };
            }

            return originalXHRSend.apply(this, arguments);
        };

        console.log('[SvgNamespaceNormalizer] XMLHttpRequest 패치 완료');
    };

    /**
     * EntryPaint (window.EntryPaint)의 addSVG 메서드를 패치합니다.
     */
    SvgNamespaceNormalizer.patchEntryPaint = function () {
        // EntryPaint가 로드될 때까지 기다림
        var checkInterval = setInterval(function () {
            if (typeof window.EntryPaint !== 'undefined' && window.EntryPaint.default) {
                var originalCreate = window.EntryPaint.default.create;
                if (originalCreate) {
                    window.EntryPaint.default.create = function (options) {
                        var instance = originalCreate.call(this, options);
                        
                        // addSVG 메서드 패치
                        if (instance && instance.addSVG) {
                            var originalAddSVG = instance.addSVG.bind(instance);
                            instance.addSVG = function (svgUrl, options) {
                                // URL에서 SVG를 가져와서 정규화 후 전달
                                return SvgNamespaceNormalizer.fetchAndNormalize(svgUrl)
                                    .then(function (normalizedSvg) {
                                        // Data URL로 변환하여 전달
                                        var dataUrl = SvgNamespaceNormalizer.toDataUrl(normalizedSvg);
                                        return originalAddSVG(dataUrl, options);
                                    })
                                    .catch(function (error) {
                                        console.warn('[SvgNamespaceNormalizer] SVG 정규화 실패, 원본 사용:', error);
                                        return originalAddSVG(svgUrl, options);
                                    });
                            };
                        }
                        
                        return instance;
                    };
                    console.log('[SvgNamespaceNormalizer] EntryPaint 패치 완료');
                }
                clearInterval(checkInterval);
            }
        }, 100);

        // 10초 후 타임아웃
        setTimeout(function () {
            clearInterval(checkInterval);
        }, 10000);
    };

    /**
     * 자동 초기화 - 스크립트 로드 시 자동 실행
     */
    SvgNamespaceNormalizer.autoInit = function () {
        if (isInitialized) {
            return;
        }
        isInitialized = true;

        console.log('[SvgNamespaceNormalizer] 자동 초기화 시작 (v' + SvgNamespaceNormalizer.version + ')');

        // 1. fetch API 패치
        SvgNamespaceNormalizer.patchFetch();

        // 2. XMLHttpRequest 패치
        SvgNamespaceNormalizer.patchXHR();

        // 3. Entry.js와 통합 (있으면)
        if (typeof Entry !== 'undefined') {
            SvgNamespaceNormalizer.integrateWithEntry();
        }

        // 4. EntryPaint 패치 (브라우저 환경에서)
        if (typeof window !== 'undefined') {
            SvgNamespaceNormalizer.patchEntryPaint();
        }

        // 5. Entry가 나중에 로드될 경우를 대비 (항상 덮어쓰기)
        if (typeof window !== 'undefined') {
            var entryIntegrated = false;
            var entryCheckInterval = setInterval(function () {
                if (typeof Entry !== 'undefined' && !entryIntegrated) {
                    var result = SvgNamespaceNormalizer.integrateWithEntry();
                    if (result) {
                        entryIntegrated = true;
                        clearInterval(entryCheckInterval);
                    }
                }
            }, 500);

            // 30초 후 타임아웃
            setTimeout(function () {
                clearInterval(entryCheckInterval);
            }, 30000);
        }

        console.log('[SvgNamespaceNormalizer] 자동 초기화 완료 - SVG 네임스페이스 문제가 자동으로 해결됩니다.');
    };

    /**
     * 패치 해제 (필요시)
     */
    SvgNamespaceNormalizer.disable = function () {
        if (originalFetch) {
            window.fetch = originalFetch;
            originalFetch = null;
            console.log('[SvgNamespaceNormalizer] fetch 패치 해제');
        }
        isInitialized = false;
    };

    /**
     * 버전 정보
     */
    SvgNamespaceNormalizer.version = '1.3.0';

    // ★ 자동 실행 ★
    // DOM이 준비되면 바로 초기화, 아니면 DOMContentLoaded 대기
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', SvgNamespaceNormalizer.autoInit);
        } else {
            // DOM이 이미 로드됨
            SvgNamespaceNormalizer.autoInit();
        }
    } else if (typeof window !== 'undefined') {
        // document가 없는 환경 (Web Worker 등)
        SvgNamespaceNormalizer.autoInit();
    }

    return SvgNamespaceNormalizer;
}));
