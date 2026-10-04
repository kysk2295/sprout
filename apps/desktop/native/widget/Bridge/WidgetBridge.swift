// widget_bridge.node — Electron 메인 프로세스가 부르는 아주 작은 Node-API 모듈(25 §8.6 A안).
// WidgetKit은 "위젯을 담은 앱"(번들 ID app.sprout.desktop, Contents/PlugIns에 위젯 확장)이 보낸 새로 고침 요청만 받는다.
// Electron 메인 프로세스가 바로 그 앱 프로세스라 별도 실행 파일(B안)보다 정체가 확실하다.
// 내보내는 함수: reloadAll() → WidgetCenter.reloadAllTimelines(), reload(kind) → reloadTimelines(ofKind:)
import Foundation
import WidgetKit

private func boolValue(_ env: napi_env?, _ value: Bool) -> napi_value? {
    var result: napi_value?
    napi_get_boolean(env, value, &result)
    return result
}

private func define(_ env: napi_env?, _ exports: napi_value?, _ name: String, _ cb: napi_callback) {
    var fn: napi_value?
    name.withCString { cname in
        _ = napi_create_function(env, cname, name.utf8.count, cb, nil, &fn)
        _ = napi_set_named_property(env, exports, cname, fn)
    }
}

@_cdecl("napi_register_module_v1")
public func sproutWidgetBridgeInit(_ env: napi_env?, _ exports: napi_value?) -> napi_value? {
    define(env, exports, "reloadAll") { env, _ in
        if #available(macOS 11.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
            return boolValue(env, true)
        }
        return boolValue(env, false)
    }
    define(env, exports, "reload") { env, info in
        var argc = 1
        var argv: [napi_value?] = [nil]
        napi_get_cb_info(env, info, &argc, &argv, nil, nil)
        var len = 0
        napi_get_value_string_utf8(env, argv[0], nil, 0, &len)
        var buf = [CChar](repeating: 0, count: len + 1)
        napi_get_value_string_utf8(env, argv[0], &buf, len + 1, &len)
        let kind = String(cString: buf)
        if #available(macOS 11.0, *), !kind.isEmpty {
            WidgetCenter.shared.reloadTimelines(ofKind: kind)
            return boolValue(env, true)
        }
        return boolValue(env, false)
    }
    return exports
}
