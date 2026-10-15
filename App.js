import {usestate, useeffect} from "react";


// CHANGE: get the current date using datetime stuff, then query database for all
//  articles on that day, then put them on map 

// initial - want a list of articles, clicking article leads to link and thumbnails 
function articlelist() {
    // use usestate to hold article state value dictionary
    // use useffect to call api, return dictionary, conver to json, store in the article state variable
    // use map to loop over individual articles and display
    // name, link, thumbnail 
    const [articles, setarticles] = useState([]);
    useEffect(() => {
        fetch('http://localhost:8000/articles?limit=20&offset=40') // how to use actual params? 
            .then(response => response.json())
            .then(data => setarrticles(data));
    }, []);
}

// export default function ... 