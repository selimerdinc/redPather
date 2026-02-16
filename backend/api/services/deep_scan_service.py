import base64
import io
import logging
import time
import hashlib
from typing import List, Dict, Any
from PIL import Image
from backend.api.services.page_analyzer import PageAnalyzer, AnalyzerConstants
from backend.core.context import driver_mgr

logger = logging.getLogger(__name__)

class DeepScanService:
    """
    Advanced Service for performing Deep Scans (Auto-scroll + Stitching)
    Version 5: Sequential capture (Stability) + Double Match Stop Logic + Robust Hashing.
    """

    def __init__(self):
        pass

    def perform_deep_scan(self, platform: str, steps: int = 20, prefix: str = "deep") -> Dict[str, Any]:
        """
        Performs iterative scans while scrolling.
        Stops when visual content AND source stay same for multiple steps.
        """
        driver = driver_mgr.get_driver()
        if not driver:
            return {"error": "Driver not active"}

        analyzer = PageAnalyzer(driver)
        window_size = driver_mgr.get_window_size()
        
        scans = []
        last_shot_hash = None
        last_source_hash = None
        stop_counter = 0 # Counter for "no-change" detections
        
        scroll_delta_ratio = 0.5 if platform == "ANDROID" else 0.8
        scroll_delta_px = int(window_size['height'] * scroll_delta_ratio)

        logger.info(f"🚀 Starting Deep Scan V5 (max {steps} steps) on {platform}")

        for i in range(steps):
            logger.info(f"📸 Step {i+1}/{steps}: Capturing...")
            
            # 🛑 STABILITY: Reverting to SEQUENTIAL capture. 
            # Parallel calls to driver (source + screenshot) can hang Appium.
            try:
                source = driver_mgr.get_page_source()
                raw_shot = driver_mgr.take_screenshot()
            except Exception as cap_err:
                logger.error(f"Capture error at step {i}: {cap_err}")
                if i > 0: break # Finish with what we have
                return {"error": f"Device communication error: {str(cap_err)}"}
            
            if not source or not raw_shot:
                logger.error(f"Empty data at step {i}")
                break

            # 🛠 Visual Matching (Robust)
            shot_bytes = base64.b64decode(raw_shot)
            img = Image.open(io.BytesIO(shot_bytes))
            
            # Crop middle to avoid static headers/status bars
            img_w, img_h = img.size
            crop_box = (0, int(img_h * 0.25), img_w, int(img_h * 0.75))
            middle_crop = img.crop(crop_box)
            
            # High-res thumb for better matching
            thumb = middle_crop.resize((128, 128), Image.Resampling.LANCZOS).convert('L')
            shot_hash = hashlib.md5(thumb.tobytes()).hexdigest()
            source_hash = hashlib.md5(source.encode()).hexdigest()

            if i > 0:
                # If BOTH visual and source match, we are likely blocked or at end
                if shot_hash == last_shot_hash and source_hash == last_source_hash:
                    stop_counter += 1
                    logger.warning(f"⚠️ No change detected (Count: {stop_counter})")
                else:
                    stop_counter = 0 # Reset if any change found
                
                # We only stop if we see NO CHANGE twice in a row (ensures we don't stop on slow renders)
                if stop_counter >= 2:
                    logger.info("🏁 Page end/blocked reached (Double no-change count).")
                    break
            
            last_shot_hash = shot_hash
            last_source_hash = source_hash

            # Analysis
            result = analyzer.analyze(source, platform, False, prefix, window_size)
            scans.append({
                "source": source,
                "image": img,
                "elements": result.get("elements", []),
                "y_offset_est": i * scroll_delta_px
            })

            if i < steps - 1:
                logger.info(f"📜 Scrolling...")
                success = driver_mgr.perform_scroll("down")
                if not success:
                    break
                # Stabilization: Wait longer for heavy pages
                time.sleep(1.8)

        if not scans:
            return {"error": "Deep scan captured no data"}

        logger.info(f"✅ Scanning finished. Processing {len(scans)} segments...")
        return self._stitch_and_merge(scans, window_size)

    def _stitch_and_merge(self, scans: List[Dict], window_size: Dict) -> Dict:
        """
        Stitches images and merges elements with adaptive offsets.
        """
        offsets = [0]
        for i in range(len(scans) - 1):
            curr_els = scans[i]["elements"]
            next_els = scans[i+1]["elements"]
            
            matches = []
            for e1 in curr_els:
                # Match only elements that aren't at the very edges
                if e1["coords"]["y"] > window_size["height"] * 0.2:
                    for e2 in next_els:
                        if e1["locator"] == e2["locator"] and e1["text"] == e2["text"]:
                            d = e1["coords"]["y"] - e2["coords"]["y"]
                            if 20 < d < window_size["height"] * 0.95:
                                matches.append(d)
            
            if matches:
                delta = sorted(matches)[len(matches)//2]
            else:
                # Fallback delta
                delta = window_size["height"] * 0.45
                logger.warning(f"No match {i}->{i+1}. Fallback: {delta}px")
            
            offsets.append(offsets[-1] + delta)

        f_w, f_h = window_size["width"], int(offsets[-1] + window_size["height"])
        f_h = min(f_h, 80000) # Support even longer pages
        
        combined_img = Image.new('RGB', (f_w, f_h), (255, 255, 255))
        total_elements = []
        global_seen = {}
        
        for i, scan in enumerate(scans):
            current_offset = int(offsets[i])
            if current_offset >= f_h: break
            
            combined_img.paste(scan["image"], (0, current_offset))
            
            for el in scan["elements"]:
                # Enhanced Sticky Filter
                is_sticky = False
                rel_y = el["coords"]["y"]
                # Elements in static zones (header/footer) that don't change relative position
                if rel_y < window_size["height"] * 0.15 or rel_y > window_size["height"] * 0.85:
                    if i > 0:
                        for p_el in scans[0]["elements"]:
                            if p_el["locator"] == el["locator"] and abs(p_el["coords"]["y"] - rel_y) < 8:
                                is_sticky = True
                                break
                
                if is_sticky: continue

                new_el = el.copy()
                abs_y = new_el["coords"]["y"] + int(current_offset)
                new_el["coords"]["y"] = abs_y
                if abs_y > f_h - 15: continue

                loc = new_el["locator"]
                is_dupe = False
                if loc in global_seen:
                    for py in global_seen[loc]:
                        if abs(abs_y - py) < 35:
                            is_dupe = True
                            break
                
                if not is_dupe:
                    total_elements.append(new_el)
                    if loc not in global_seen: global_seen[loc] = []
                    global_seen[loc].append(abs_y)

        # Output optimization
        out = io.BytesIO()
        combined_img.save(out, format="JPEG", quality=AnalyzerConstants.IMAGE_QUALITY)
        
        return {
            "image": base64.b64encode(out.getvalue()).decode('utf-8'),
            "elements": total_elements,
            "page_name": scans[0].get("elements", [{}])[0].get("variable", "deep").split('_')[0] if scans[0]["elements"] else "deep",
            "window_w": f_w,
            "window_h": f_h,
            "segments": len(scans)
        }
