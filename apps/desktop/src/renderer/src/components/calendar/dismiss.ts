// 06 §14.2: 팝오버가 떠 있을 때 캘린더 칸을 누르면 팝오버만 닫고 새 초안을 열지 않는다.
// 끌기 시작(pointerdown)에서 preventDefault를 부르면 mousedown이 생기지 않아 Popover의 바깥 클릭 닫기가 안 돌았다 —
// 이때는 끌기를 시작하지 않고 그대로 두어 Popover가 바깥 클릭으로 닫히게 한다(빠른 만들기는 제목이 있으면 저장, 비었으면 취소).
/** 빈 칸 클릭(새 초안): 어떤 팝오버든 떠 있으면 닫기만 */
export const popoverOpen = () => !!document.querySelector('.popover')
/** 막대·블록 클릭: 빠른 만들기가 떠 있으면 먼저 닫기만(쓴 제목이 말없이 사라지지 않게) */
export const quickCreateOpen = () => !!document.querySelector('.popover.qc')
