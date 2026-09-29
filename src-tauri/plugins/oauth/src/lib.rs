use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

#[cfg(target_os = "ios")]
use serde::Serialize;
#[cfg(target_os = "ios")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_oauth);

#[cfg(target_os = "ios")]
struct OauthHandle<R: Runtime>(PluginHandle<R>);

#[cfg(target_os = "ios")]
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct StartPayload {
    url: String,
    callback_scheme: String,
}

#[tauri::command]
async fn start<R: Runtime>(
    app: AppHandle<R>,
    url: String,
    callback_scheme: String,
) -> Result<String, String> {
    #[cfg(target_os = "ios")]
    {
        let handle = app.state::<OauthHandle<R>>();
        handle
            .0
            .run_mobile_plugin_async("start", StartPayload { url, callback_scheme })
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, url, callback_scheme);
        Err("In-app sign-in is only available on iPhone and iPad.".into())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("oauth")
        .invoke_handler(tauri::generate_handler![start])
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            {
                let handle = api.register_ios_plugin(init_plugin_oauth)?;
                app.manage(OauthHandle(handle));
            }
            #[cfg(not(target_os = "ios"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}
