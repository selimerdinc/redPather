"""
Jira Integration Service - Create issues directly from Red Pather
"""
import logging
import requests
import base64

logger = logging.getLogger(__name__)


class JiraService:
    def __init__(self):
        self.base_url = None
        self.email = None
        self.api_token = None
        self.project_key = None
    
    def configure(self, base_url, email, api_token, project_key):
        """Jira credentials'ları ayarla"""
        self.base_url = base_url.rstrip('/') if base_url else None
        self.email = email
        self.api_token = api_token
        self.project_key = project_key
        logger.info(f"🔗 Jira configured: {self.base_url} / {self.project_key}")
    
    def is_configured(self):
        """Jira yapılandırılmış mı kontrol et"""
        return all([self.base_url, self.email, self.api_token, self.project_key])
    
    def _get_auth_header(self):
        """Basic auth header oluştur"""
        credentials = f"{self.email}:{self.api_token}"
        encoded = base64.b64encode(credentials.encode()).decode()
        return {"Authorization": f"Basic {encoded}"}
    
    def create_issue(self, summary, description, issue_type="Bug", priority="Medium", screenshot_base64=None):
        """
        Jira'da yeni issue oluştur
        
        Args:
            summary: Issue başlığı
            description: Detaylı açıklama
            issue_type: Bug, Task, Story vb.
            priority: Highest, High, Medium, Low, Lowest
            screenshot_base64: Opsiyonel screenshot (base64)
        
        Returns:
            dict: { success, issue_key, issue_url } veya { success: False, error }
        """
        if not self.is_configured():
            return {"success": False, "error": "Jira not configured. Please set credentials in Settings."}
        
        try:
            # Issue oluştur
            url = f"{self.base_url}/rest/api/3/issue"
            headers = {
                **self._get_auth_header(),
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
            
            # Jira ADF (Atlassian Document Format) için description
            adf_description = {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": description}]
                    }
                ]
            }
            
            payload = {
                "fields": {
                    "project": {"key": self.project_key},
                    "summary": summary,
                    "description": adf_description,
                    "issuetype": {"name": issue_type}
                }
            }
            
            # Priority ekle (opsiyonel - bazı projelerde olmayabilir)
            try:
                priority_map = {
                    "Highest": "1", "High": "2", "Medium": "3", "Low": "4", "Lowest": "5"
                }
                if priority in priority_map:
                    payload["fields"]["priority"] = {"id": priority_map[priority]}
            except Exception:
                pass
            
            response = requests.post(url, json=payload, headers=headers, timeout=30)
            
            if response.status_code in [200, 201]:
                data = response.json()
                issue_key = data.get("key")
                issue_url = f"{self.base_url}/browse/{issue_key}"
                
                logger.info(f"✅ Jira issue created: {issue_key}")
                
                # Screenshot varsa attachment olarak ekle
                if screenshot_base64 and issue_key:
                    self._attach_screenshot(issue_key, screenshot_base64)
                
                return {
                    "success": True,
                    "issue_key": issue_key,
                    "issue_url": issue_url
                }
            else:
                error_msg = response.text[:500]
                logger.error(f"❌ Jira API error: {response.status_code} - {error_msg}")
                return {"success": False, "error": f"Jira API error: {response.status_code}"}
                
        except requests.exceptions.Timeout:
            return {"success": False, "error": "Jira connection timeout"}
        except Exception as e:
            logger.error(f"❌ Jira create issue failed: {e}")
            return {"success": False, "error": str(e)}
    
    def _attach_screenshot(self, issue_key, screenshot_base64):
        """Issue'ya screenshot ekle"""
        try:
            url = f"{self.base_url}/rest/api/3/issue/{issue_key}/attachments"
            headers = {
                **self._get_auth_header(),
                "X-Atlassian-Token": "no-check"
            }
            
            # Base64'ü binary'ye çevir
            if "," in screenshot_base64:
                screenshot_base64 = screenshot_base64.split(",")[1]
            
            screenshot_bytes = base64.b64decode(screenshot_base64)
            
            files = {
                "file": ("screenshot.png", screenshot_bytes, "image/png")
            }
            
            response = requests.post(url, headers=headers, files=files, timeout=30)
            
            if response.status_code in [200, 201]:
                logger.info(f"📎 Screenshot attached to {issue_key}")
                return True
            else:
                logger.warning(f"⚠️ Failed to attach screenshot: {response.status_code}")
                return False
                
        except Exception as e:
            logger.warning(f"⚠️ Screenshot attachment failed: {e}")
            return False
    
    def test_connection(self):
        """Jira bağlantısını test et"""
        if not self.is_configured():
            return {"success": False, "error": "Jira not configured"}
        
        try:
            url = f"{self.base_url}/rest/api/3/myself"
            headers = {**self._get_auth_header(), "Accept": "application/json"}
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                user = response.json()
                return {
                    "success": True,
                    "user": user.get("displayName", user.get("emailAddress", "Unknown"))
                }
            else:
                return {"success": False, "error": f"Auth failed: {response.status_code}"}
                
        except Exception as e:
            return {"success": False, "error": str(e)}


# Singleton instance
jira_service = JiraService()
