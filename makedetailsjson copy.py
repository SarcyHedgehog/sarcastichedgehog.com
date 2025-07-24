import os
import json
from bs4 import BeautifulSoup

input_dir = "titles"
output_file = "details.json"
details = {}

for filename in os.listdir(input_dir):
    if filename.endswith(".html"):
        path = os.path.join(input_dir, filename)
        with open(path, "r", encoding="utf-8") as f:
            soup = BeautifulSoup(f, "html.parser")
            
            title = soup.find("h2").get_text(strip=True) if soup.find("h2") else filename.replace(".html", "")
            year = None
            developer = None
            label = None
            description = ""
            image = ""

            # Extract metadata
            meta_section = soup.find_all("p")[0] if soup.find_all("p") else None
            if meta_section:
                for line in meta_section.decode_contents().split("<br>"):
                    line = BeautifulSoup(line, "html.parser").get_text(strip=True)
                    if line.lower().startswith("year:"):
                        year = line[5:].strip()
                    elif line.lower().startswith("developer:"):
                        developer = line[10:].strip()
                    elif line.lower().startswith("label:"):
                        label = line[6:].strip()

            # Description (usually second <p>)
            desc_section = soup.find_all("p")[1] if len(soup.find_all("p")) > 1 else None
            if desc_section:
                description = desc_section.get_text(strip=True)

            # Image src
            img = soup.find("img")
            if img and img.get("src"):
                image = img["src"]

            # Add to dictionary
            details[title] = {
                "title": title,
                "year": year,
                "developer": developer,
                "label": label,
                "description": description,
                "image": image
            }

# Write to JSON
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(details, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(details)} entries to {output_file}")
