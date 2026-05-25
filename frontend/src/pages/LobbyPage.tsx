import { useState } from "react";
import { roomService } from "../services/roomService";
import { useNavigate } from "react-router-dom";
import { storage } from "../utils/storage";

export default function LobbyPage() {
    const [roomName, setRoomName] = useState(() => storage.getRoomName());
    const [userName, setUserName] = useState(() => storage.getUserName());
    const [joinId, setJoinId] = useState("");
    const navigate = useNavigate();

    const handleJoin = async () => {
        if (!userName || !joinId) {
            alert("Please enter your name and room ID");
            return;
        }
        storage.setUserName(userName);
        try {
            const data = await roomService.joinRoom(joinId, userName);
            storage.setUserId(data.user.userId);

            alert("Joined room: " + data.room.roomId);
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            console.error("Failed to join room", error);
            alert("Be error joining room");
        }
    }

    const handleCreate = async () => {
        if (!userName || !roomName) {
            alert("Please enter your name and room name");
            return;
        }
        storage.setRoomName(roomName);
        storage.setUserName(userName);
        try {
            const data = await roomService.createRoom(roomName, userName);
            storage.setUserId(data.user.userId);
            alert("Tạo phòng thành công. ID Phòng: " + data.room.roomId);
            navigate(`/room/${data.room.roomId}`);
        } catch (error) {
            console.error("Failed to create room", error);
            alert("Be error creating room");
        }
    }
    return (
        <div className="lobby-container">
            <h1>Karaoke Battle</h1>
            <div className="control-panel">
                <input
                    type="text"
                    placeholder="Nhập tên của bạn"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Hãy đặt tên phòng"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                />
                <button onClick={handleCreate}>Tạo phòng ngay</button>
            </div>
            <div style={{ margin: "20px 0", fontWeight: "bold" }}>Hoặc </div>
            <div className="control-panel">
                <input
                    type="text"
                    placeholder="Nhập tên của bạn"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Nhập ID phòng"
                    value={joinId}
                    onChange={(e) => setJoinId(e.target.value)}
                />
                <button onClick={handleJoin}>Tham gia phòng</button>
            </div>
        </div>
    );
}