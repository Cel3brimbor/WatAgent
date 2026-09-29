use serde::{Deserialize, Serialize};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Runtime,
};

#[cfg(target_os = "ios")]
use tauri::{plugin::PluginHandle, Manager};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_secure_store);

#[cfg(target_os = "ios")]
struct SecureStoreHandle<R: Runtime>(PluginHandle<R>);

#[cfg(not(target_os = "ios"))]
const UNSUPPORTED: &str = "Secure storage is only available on iPhone and iPad.";

#[derive(Serialize, Deserialize, Default)]
struct TokenResult {
    token: Option<String>,
}

#[cfg(target_os = "ios")]
#[derive(Serialize)]
struct TokenPayload {
    token: String,
}

#[tauri::command]
async fn store_refresh_token<R: Runtime>(app: AppHandle<R>, token: String) -> Result<(), String> {
    if token.is_empty() || token.len() > 4096 {
        return Err("Invalid token.".into());
    }
    #[cfg(target_os = "ios")]
    {
        app.state::<SecureStoreHandle<R>>()
            .0
            .run_mobile_plugin_async::<()>("storeRefreshToken", TokenPayload { token })
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = (app, token);
        Err(UNSUPPORTED.into())
    }
}

#[tauri::command]
async fn load_refresh_token<R: Runtime>(app: AppHandle<R>) -> Result<TokenResult, String> {
    #[cfg(target_os = "ios")]
    {
        app.state::<SecureStoreHandle<R>>()
            .0
            .run_mobile_plugin_async::<TokenResult>("loadRefreshToken", ())
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        Err(UNSUPPORTED.into())
    }
}

#[tauri::command]
async fn clear_session<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    {
        app.state::<SecureStoreHandle<R>>()
            .0
            .run_mobile_plugin_async::<()>("clearSession", ())
            .await
            .map_err(|err| err.to_string())
    }
    #[cfg(not(target_os = "ios"))]
    {
        let _ = app;
        Ok(())
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("secure-store")
        .invoke_handler(tauri::generate_handler![
            store_refresh_token,
            load_refresh_token,
            clear_session
        ])
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            {
                let handle = api.register_ios_plugin(init_plugin_secure_store)?;
                app.manage(SecureStoreHandle(handle));
            }
            #[cfg(not(target_os = "ios"))]
            {
                let _ = (app, api);
            }
            Ok(())
        })
        .build()
}
