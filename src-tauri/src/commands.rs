use std::process::Command;
use url::Url;
use tauri_plugin_opener::OpenerExt;
use tauri::AppHandle;

#[tauri::command]
pub async fn launch_web3_browser(app: AppHandle, url: String) -> Result<bool, String> {
    let parsed_url = Url::parse(&url).map_err(|_| "Invalid URL format")?;
    if parsed_url.scheme() != "https" {
        return Err("Only HTTPS protocol is allowed".to_string());
    }
    
    // Allow bridge URLs
    if parsed_url.host_str() != Some("the-undesirables.com") && parsed_url.host_str() != Some("the-undesirables.vercel.app") {
        return Err("Unauthorized URL domain".to_string());
    }

    let safe_url = parsed_url.as_str();

    #[cfg(target_os = "macos")]
    {
        let web3_browsers = [
            "company.thebrowser.Browser", // Arc
            "com.brave.Browser",          // Brave
            "com.google.Chrome",          // Google Chrome
            "com.microsoft.edgemac",      // Microsoft Edge
            "org.mozilla.firefox",        // Firefox 
        ];

        for bundle_id in web3_browsers.iter() {
            let status = Command::new("open")
                .args(["-b", bundle_id, safe_url])
                .status();

            if let Ok(exit_status) = status {
                if exit_status.success() {
                    return Ok(true); 
                }
            }
        }
    }

    match app.opener().open_url(safe_url, None::<&str>) {
        Ok(_) => Ok(false),
        Err(e) => Err(format!("Failed to open default browser: {}", e)),
    }
}
