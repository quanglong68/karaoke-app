import { useState } from "react";
import { roomService } from "../services/roomService";
import { useNavigate } from "react-router-dom";



export default function LobbyPage() {
    const [roomName, setRoomName] = useState(() => { return localStorage.getItem("roomName") || "" });
    const [userName, setUserName] = useState(() => { return localStorage.getItem("userName") || "" });
    const [joinId, setJoinId] = useState("");
    const navigate = useNavigate();

    const handleJoin = async () => {
        if (!userName || !joinId) {
            alert("Please enter your name and room ID");
            return;
        }
        localStorage.setItem("userName", userName);
        try {
            const room = await roomService.joinRoom(joinId, userName);
            alert("Joined room: " + room.roomId);
            navigate(`/room/${room.roomId}`);
        } catch (error) {
            console.error("Failed to join room", error);
            alert("Be error joining room");
        }
    }

    const handleCreate = async () => {
        if (!roomName) {
            alert("Please enter your name");
            return;
        }
        localStorage.setItem("roomName", roomName);
        try {
            const room = await roomService.createRoom(roomName);
            alert("Tạo phòng thành công. ID Phòng: " + room.roomId);
            navigate(`/room/${room.roomId}`);
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
                    placeholder="Hãy đặt tên phòng"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                />
                <button onClick={handleCreate}>Tạo phòng ngay</button>
            </div>
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