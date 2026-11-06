import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";
import coords from "./coords.json"; // 관광지 이름|주소 → 좌표 (미리 변환해 둔 파일)
import daeguBoundary from "./daegu-boundary.json"; // 대구광역시 경계선

const API_KEY = import.meta.env.VITE_API_KEY;
const DAEGU_CENTER = [35.8714, 128.6014];

// 관광명소 목록을 XML로 받아서 JS 객체 배열로 변환
async function fetchAttractions() {
  const url = `https://apis.data.go.kr/6270000/getTourKorAttract/getTourKorAttractList?pageNo=1&numOfRows=300&ServiceKey=${API_KEY}`;
  const response = await fetch(url);
  const text = await response.text();
  const xml = new DOMParser().parseFromString(text, "application/xml");

  const seen = {}; // 같은 좌표가 몇 번 나왔는지
  return [...xml.getElementsByTagName("item")].map((item, index) => {
    const obj = { id: index };
    for (const child of item.children) {
      obj[child.tagName] = child.textContent.trim();
    }
    const c = coords[`${obj.attractname}|${obj.address}`];
    if (c) {
      // 좌표가 겹치면 원 모양으로 살짝 떨어뜨려서 모두 클릭할 수 있게
      const key = `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
      const n = (seen[key] = (seen[key] ?? -1) + 1);
      const angle = n * 2.4;
      const r = n === 0 ? 0 : 0.0012 * Math.sqrt(n);
      obj.pos = { lat: c.lat + r * Math.sin(angle), lng: c.lng + r * Math.cos(angle) };
    } else {
      obj.pos = null;
    }
    return obj;
  });
}

// attr01 ~ attr05 는 "항목|값" 형태
function parseAttrs(place) {
  return ["attr01", "attr02", "attr03", "attr04", "attr05"]
    .map((key) => (place[key] || "").split("|"))
    .filter(([label]) => label)
    .map(([label, value]) => ({ label, value: value?.trim() || "정보 없음" }));
}

const pinIcon = L.divIcon({
  className: "pin",
  html: "<span></span>",
  iconSize: [22, 22],
  iconAnchor: [11, 22],
});

function App() {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markersRef = useRef({});
  const [attractions, setAttractions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("불러오는 중...");
  const [keyword, setKeyword] = useState("");

  // 지도 만들기
  useEffect(() => {
    const map = L.map(mapRef.current, { minZoom: 9 }).setView(DAEGU_CENTER, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // 대구 경계 표시 + 대구 바깥으로 너무 멀리 못 가게
    const boundary = L.geoJSON(daeguBoundary, {
      style: { color: "#2563eb", weight: 3, fillColor: "#3b82f6", fillOpacity: 0.06 },
      interactive: false,
    }).addTo(map);
    map.fitBounds(boundary.getBounds());
    map.setMaxBounds(boundary.getBounds().pad(0.3));

    mapObj.current = map;
    return () => map.remove();
  }, []);

  // 관광명소 불러와서 마커 찍기
  useEffect(() => {
    let cancelled = false;
    fetchAttractions()
      .then((list) => {
        if (cancelled) return;
        setAttractions(list);
        const map = mapObj.current;
        list.forEach((place) => {
          if (!place.pos) return;
          const marker = L.marker([place.pos.lat, place.pos.lng], { icon: pinIcon, title: place.attractname })
            .bindTooltip(place.attractname, { direction: "top", offset: [0, -20] })
            .on("click", () => setSelected(place))
            .addTo(map);
          markersRef.current[place.id] = marker;
        });
        const shown = list.filter((p) => p.pos).length;
        setStatus(`관광명소 ${list.length}곳 중 ${shown}곳 지도에 표시`);
      })
      .catch((err) => {
        console.error(err);
        setStatus("관광명소를 불러오지 못했습니다.");
      });
    return () => {
      cancelled = true;
      Object.values(markersRef.current).forEach((m) => m.remove());
      markersRef.current = {};
    };
  }, []);

  // 선택한 관광지로 지도 이동 + 마커 강조
  useEffect(() => {
    Object.entries(markersRef.current).forEach(([id, m]) => {
      m.getElement()?.classList.toggle("pin-active", selected?.id === Number(id));
    });
    if (selected?.pos) {
      mapObj.current.flyTo([selected.pos.lat, selected.pos.lng], 15, { duration: 0.8 });
    }
  }, [selected]);

  // ESC로 상세창 닫기
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = attractions.filter((p) => p.attractname?.includes(keyword));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>대구 관광명소</h1>
        <p className="status">{status}</p>
        <input
          className="search"
          placeholder="관광지 이름 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <ul className="list">
          {filtered.map((p) => (
            <li
              key={p.id}
              className={selected?.id === p.id ? "active" : ""}
              onClick={() => setSelected(p)}
            >
              <strong>
                {p.attractname}
                {!p.pos && <em className="nopos">위치 없음</em>}
              </strong>
              <span>{p.address}</span>
            </li>
          ))}
        </ul>
      </aside>

      <main className="map-wrap">
        <div ref={mapRef} className="map" />
      </main>

      {selected && (
        <div className="overlay" onClick={() => setSelected(null)}>
          <section className="detail" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)} aria-label="닫기">
              ×
            </button>
            <h2>{selected.attractname}</h2>
            <p className="address">📍 {selected.address}</p>
            {!selected.pos && <p className="warn">지도에서 위치를 찾지 못한 장소입니다.</p>}

            <p className="contents">{selected.attractcontents || "설명이 없습니다."}</p>

            <dl>
              {parseAttrs(selected).map((a) => (
                <div key={a.label}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
              {selected.tel && (
                <div>
                  <dt>전화번호</dt>
                  <dd>{selected.tel}</dd>
                </div>
              )}
              {selected.homepage && (
                <div>
                  <dt>홈페이지</dt>
                  <dd>
                    <a href={selected.homepage} target="_blank" rel="noreferrer">
                      {selected.homepage}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
