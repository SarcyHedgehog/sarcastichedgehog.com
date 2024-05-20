window.onload = function() {
    var navigation = document.getElementById('navigation');
    for (let i = 1; i <= 19; i++) {
        let button = document.createElement('button');
        button.innerText = i;
        button.onclick = function() { changeImage(i); };
        button.id = 'btn' + i;
        if (i === 1) button.classList.add('active');
        navigation.appendChild(button);
    }
};

function changeImage(index) {
    var activeBtn = document.querySelector('.navigation .active');
    if(activeBtn) {
        activeBtn.classList.remove('active');
    }
    document.getElementById('btn' + index).classList.add('active');
    document.getElementById('current-image').src = `images/story/logo${index}.png`;
    document.getElementById('current-image').alt = `Page ${index} of Storybook`;
}
