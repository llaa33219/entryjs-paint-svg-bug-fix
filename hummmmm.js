/**
 * SVG Namespace Normalizer (Auto-Execute Version)
 * 
 * 일부 SVG 편집기(Adobe Illustrator, Inkscape 등)에서 내보낸 SVG 파일에서
 * ns1:, ns0: 등의 비표준 네임스페이스 접두사가 사용되어 로드 오류가 발생하는 문제를 해결합니다.
 * 
 * Entry.js 모양 탭에서 벡터 모양을 불러올 때 네임스페이스가 ns1일 때 
 * 에러가 발생해서 모양이 안 불러와지는 경우를 해결합니다.
 * 
 * ★ 이 스크립트는 로드 시 자동으로 실행되어 Entry.js에 통합됩니다. ★
 * 
 * @author Entry.js Team
 * @version 1.1.0
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
     * SVG 문자열에서 네임스페이스 문제가 있는지 감지합니다.
     * 
     * @param {string} svgString - 검사할 SVG 문자열
     * @returns {boolean} 네임스페이스 문제가 있으면 true
     */
    SvgNamespaceNormalizer.hasIssue = function (svgString) {
        if (!svgString || typeof svgString !== 'string') {
            return false;
        }
        // ns0:, ns1:, ns2: 등의 패턴이 있는지 확인
        return /ns\d+:/i.test(svgString);
    };

    /**
     * SVG 네임스페이스 정규화 함수
     * 
     * ns1:, ns0: 등의 비표준 네임스페이스 접두사를 제거하고
     * 표준 SVG 형식으로 변환합니다.
     * 
     * base64로 인코딩된 비트맵 이미지가 포함된 경우에도 안전하게 처리합니다.
     * 
     * @param {string} svgString - 정규화할 SVG 문자열
     * @returns {string} 정규화된 SVG 문자열
     * 
     * @example
     * // 변환 전: <ns1:svg xmlns:ns1="http://www.w3.org/2000/svg"><ns1:path ns1:d="M0 0"/></ns1:svg>
     * // 변환 후: <svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>
     */
    SvgNamespaceNormalizer.normalize = function (svgString) {
        if (!svgString || typeof svgString !== 'string') {
            return svgString;
        }

        var result = svgString;
        
        // base64 데이터 URL을 보호하기 위한 플레이스홀더 처리
        var base64Placeholders = [];
        var placeholderPrefix = '___BASE64_PLACEHOLDER_';
        var placeholderSuffix = '___';
        
        // data:image/... 형식의 base64 데이터 URL을 모두 추출하여 플레이스홀더로 대체
        // 예: data:image/png;base64,iVBORw0KGgo... 또는 data:image/jpeg;base64,...
        // 주의: base64 문자열에는 줄바꿈이나 공백이 포함될 수 있으므로,
        // 따옴표 내부의 모든 문자를 매칭하기 위해 [^"]* 와 [^']* 패턴을 사용합니다.
        
        // 큰따옴표로 감싸진 base64 데이터 URL (줄바꿈, 공백 포함)
        result = result.replace(/"data:image\/[^;]+;base64,[^"]*"/g, function(match) {
            var index = base64Placeholders.length;
            base64Placeholders.push(match);
            return placeholderPrefix + index + placeholderSuffix;
        });
        
        // 작은따옴표로 감싸진 base64 데이터 URL (줄바꿈, 공백 포함)
        result = result.replace(/'data:image\/[^;]+;base64,[^']*'/g, function(match) {
            var index = base64Placeholders.length;
            base64Placeholders.push(match);
            return placeholderPrefix + index + placeholderSuffix;
        });

        // xlink 네임스페이스를 가리키는 ns 접두사 번호들을 추출
        // 예: xmlns:ns1="http://www.w3.org/1999/xlink" -> ns1이 xlink를 가리킴
        var xlinkNsPrefixes = [];
        var xlinkNsPattern = /xmlns:ns(\d+)\s*=\s*["']http:\/\/www\.w3\.org\/1999\/xlink["']/gi;
        var xlinkMatch;
        while ((xlinkMatch = xlinkNsPattern.exec(result)) !== null) {
            xlinkNsPrefixes.push(xlinkMatch[1]);
        }

        // 1. xmlns:ns0, xmlns:ns1, xmlns:ns2 등의 네임스페이스 선언 제거
        // 예: xmlns:ns1="http://www.w3.org/2000/svg" 제거
        result = result.replace(/\s*xmlns:ns\d+\s*=\s*["'][^"']*["']/gi, '');

        // 2. 요소 태그에서 ns0:, ns1:, ns2: 등의 접두사 제거
        // 예: <ns1:svg> -> <svg>, </ns1:svg> -> </svg>
        // 예: <ns1:path> -> <path>, </ns1:path> -> </path>
        result = result.replace(/<(\/?)\s*ns\d+:/gi, '<$1');

        // 3. xlink를 가리키는 ns 접두사는 xlink로 변환
        // 예: ns1:href -> xlink:href (ns1이 xlink를 가리킬 때)
        for (var j = 0; j < xlinkNsPrefixes.length; j++) {
            var nsNum = xlinkNsPrefixes[j];
            var nsToXlinkPattern = new RegExp('\\s+ns' + nsNum + ':([a-zA-Z][a-zA-Z0-9-]*)\\s*=', 'gi');
            result = result.replace(nsToXlinkPattern, ' xlink:$1=');
        }

        // 4. 나머지 속성에서 ns0:, ns1:, ns2: 등의 접두사 제거
        // 예: ns1:d="M0 0" -> d="M0 0"
        // 예: ns1:fill="red" -> fill="red"
        result = result.replace(/\s+ns\d+:([a-zA-Z][a-zA-Z0-9-]*)\s*=/gi, ' $1=');

        // 5. xlink 네임스페이스 처리 (xlink:href는 유지하되, 선언이 없으면 추가)
        if (result.indexOf('xlink:href') !== -1 && result.indexOf('xmlns:xlink') === -1) {
            result = result.replace(
                /<svg([^>]*)>/i,
                '<svg$1 xmlns:xlink="http://www.w3.org/1999/xlink">'
            );
        }

        // 6. SVG 기본 네임스페이스가 없으면 추가
        if (result.indexOf('xmlns="http://www.w3.org/2000/svg"') === -1 &&
            result.indexOf("xmlns='http://www.w3.org/2000/svg'") === -1) {
            result = result.replace(
                /<svg([^>]*)>/i,
                '<svg$1 xmlns="http://www.w3.org/2000/svg">'
            );
        }

        // 7. 태그 내부의 불필요한 공백만 정리 (텍스트 콘텐츠는 유지)
        result = result.replace(/(<[^>]*?)\s{2,}([^>]*>)/g, function(match) {
            return match.replace(/\s{2,}/g, ' ');
        });
        result = result.replace(/\s+>/g, '>');
        result = result.replace(/<\s+/g, '<');
        
        // 8. base64 플레이스홀더를 원래 데이터로 복원
        for (var i = 0; i < base64Placeholders.length; i++) {
            var placeholder = placeholderPrefix + i + placeholderSuffix;
            result = result.replace(placeholder, base64Placeholders[i]);
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
     * Entry.Utils에 함수들을 추가합니다.
     */
    SvgNamespaceNormalizer.integrateWithEntry = function () {
        if (typeof Entry !== 'undefined' && Entry.Utils) {
            Entry.Utils.normalizeSvgNamespace = SvgNamespaceNormalizer.normalize;
            Entry.Utils.hasSvgNamespaceIssue = SvgNamespaceNormalizer.hasIssue;
            Entry.Utils.fetchAndNormalizeSvg = SvgNamespaceNormalizer.fetchAndNormalize;
            Entry.Utils.svgToNormalizedDataUrl = SvgNamespaceNormalizer.toDataUrl;
            console.log('[SvgNamespaceNormalizer] Entry.Utils에 통합 완료');
        }
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

        // 5. Entry가 나중에 로드될 경우를 대비
        if (typeof window !== 'undefined') {
            var entryCheckInterval = setInterval(function () {
                if (typeof Entry !== 'undefined' && Entry.Utils && !Entry.Utils.normalizeSvgNamespace) {
                    SvgNamespaceNormalizer.integrateWithEntry();
                    clearInterval(entryCheckInterval);
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
    SvgNamespaceNormalizer.version = '1.2.0';

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
